"""Business rules for users (AUTH-5). Keeps profiles and Supabase Auth in step."""

import logging
import uuid
from datetime import timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common.pagination import Page, PageParams, paginate
from app.common.time import utcnow
from app.core.exceptions import AppError, Conflict, NotFound, UpstreamError, ValidationFailed
from app.modules.auth.supabase_admin import AuthAdmin, AuthAdminError
from app.modules.users import repository
from app.modules.users.models import Profile, Role
from app.modules.users.schemas import UserCreate, UserOut, UserUpdate

logger = logging.getLogger(__name__)

MIN_PASSWORD_LENGTH = 10
LAST_ACTIVE_RESOLUTION = timedelta(minutes=5)


def email_taken() -> Conflict:
    return Conflict("A user with this email already exists.", code="EMAIL_TAKEN")


def _auth_error(exc: AuthAdminError) -> AppError:
    if exc.code == "email_exists":
        return email_taken()
    if exc.code == "weak_password":
        return ValidationFailed(exc.message, code="WEAK_PASSWORD")
    logger.error("Supabase Auth admin call failed: %s %s", exc.code, exc.message)
    return UpstreamError("Couldn’t reach the sign-in service. Try again.", code="AUTH_PROVIDER_ERROR")


def get_active_by_auth_user_id(db: Session, auth_user_id: uuid.UUID) -> Profile | None:
    profile = repository.get_by_auth_user_id(db, auth_user_id)
    return profile if profile and profile.is_active else None


def touch_last_active(db: Session, profile: Profile) -> Profile:
    now = utcnow()
    if profile.last_active_at is None or now - profile.last_active_at >= LAST_ACTIVE_RESOLUTION:
        profile.last_active_at = now
        db.commit()
    return profile


def list_users(db: Session, params: PageParams) -> Page[UserOut]:
    return paginate(db, repository.list_query(), params, UserOut.model_validate)


def create_profile(db: Session, *, auth_user_id: uuid.UUID, name: str, email: str, role: Role) -> Profile:
    """Inserts the profile for an existing Supabase user (caller commits)."""
    return repository.add(db, Profile(auth_user_id=auth_user_id, name=name, email=email.lower(), role=role))


def create_user(db: Session, auth_admin: AuthAdmin, data: UserCreate) -> Profile:
    if repository.get_by_email(db, data.email):
        raise email_taken()
    if len(data.password) < MIN_PASSWORD_LENGTH:
        raise ValidationFailed(f"Use at least {MIN_PASSWORD_LENGTH} characters.", code="WEAK_PASSWORD")

    try:
        auth_user_id = auth_admin.create_user(data.email, data.password)
    except AuthAdminError as exc:
        raise _auth_error(exc) from exc

    try:
        profile = create_profile(
            db, auth_user_id=auth_user_id, name=data.name, email=data.email, role=data.role
        )
        db.commit()
    except Exception as exc:
        # Don't leave a Supabase account that has no profile behind.
        db.rollback()
        try:
            auth_admin.delete_user(auth_user_id)
        except AuthAdminError:
            logger.exception("Could not remove orphaned Supabase user %s", auth_user_id)
        if isinstance(exc, IntegrityError):
            raise email_taken() from exc
        raise
    return profile


def update_user(
    db: Session, auth_admin: AuthAdmin, actor: Profile, user_id: int, data: UserUpdate
) -> Profile:
    user = repository.get(db, user_id)
    if user is None:
        raise NotFound("User not found.")

    is_self = user.id == actor.id
    if is_self and data.is_active is False:
        raise Conflict("You can’t deactivate your own account.", code="CANNOT_DEACTIVATE_SELF")
    if is_self and data.role is not None and data.role != user.role:
        raise Conflict("You can’t change your own role.", code="CANNOT_CHANGE_OWN_ROLE")

    new_email = data.email if data.email is not None and data.email != user.email else None
    if new_email:
        other = repository.get_by_email(db, new_email)
        if other and other.id != user.id:
            raise email_taken()
    ban_change = data.is_active is not None and data.is_active != user.is_active

    if data.name is not None:
        user.name = data.name
    if data.role is not None:
        user.role = data.role
    if new_email:
        user.email = new_email
    if data.is_active is not None:
        user.is_active = data.is_active

    try:
        db.flush()
        if new_email or ban_change:
            auth_admin.update_user(
                user.auth_user_id, email=new_email, banned=(not user.is_active) if ban_change else None
            )
        db.commit()
    except AuthAdminError as exc:
        db.rollback()
        raise _auth_error(exc) from exc
    except IntegrityError as exc:
        db.rollback()
        raise email_taken() from exc
    return user
