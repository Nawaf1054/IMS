"""Verifies Supabase Auth access tokens (AUTH-3).

Supabase signs access tokens either with asymmetric keys (ES256/RS256, the default for new
projects; public keys at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`) or with the legacy
shared secret (HS256, also used by the local CLI and the tests). Both are accepted.
"""

from functools import lru_cache
from typing import Any, Protocol

import jwt

from app.core.config import Settings, get_settings
from app.core.exceptions import NotAuthenticated

AUDIENCE = "authenticated"
ASYMMETRIC_ALGORITHMS = ["ES256", "RS256"]


class SigningKeySource(Protocol):
    def get_signing_key_from_jwt(self, token: str) -> jwt.PyJWK: ...


class TokenVerifier:
    def __init__(self, settings: Settings, jwks: SigningKeySource | None = None):
        self._issuer = settings.jwt_issuer
        self._hs256_secret = settings.supabase_jwt_secret
        # Keys are fetched from wherever this server reaches Supabase, which may differ from the issuer.
        self._jwks = jwks or jwt.PyJWKClient(
            f"{settings.supabase_auth_url}/.well-known/jwks.json", cache_keys=True, lifespan=600
        )

    def verify(self, token: str) -> dict[str, Any]:
        """Returns the token's claims, or raises NotAuthenticated."""
        try:
            algorithm = jwt.get_unverified_header(token).get("alg")
            if algorithm == "HS256":
                if not self._hs256_secret:
                    raise NotAuthenticated()
                key: Any = self._hs256_secret
                algorithms = ["HS256"]
            elif algorithm in ASYMMETRIC_ALGORITHMS:
                key = self._jwks.get_signing_key_from_jwt(token).key
                algorithms = ASYMMETRIC_ALGORITHMS
            else:
                raise NotAuthenticated()
            return jwt.decode(
                token,
                key,
                algorithms=algorithms,
                audience=AUDIENCE,
                issuer=self._issuer,
                options={"require": ["exp", "sub", "aud", "iss"]},
            )
        except (jwt.PyJWTError, ValueError) as exc:
            raise NotAuthenticated() from exc


@lru_cache
def get_token_verifier() -> TokenVerifier:
    return TokenVerifier(get_settings())
