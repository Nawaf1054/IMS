"""Token verification: HS256 (shared secret) and ES256 (Supabase signing keys via JWKS)."""

import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.core.config import get_settings
from app.core.exceptions import NotAuthenticated
from app.core.security import TokenVerifier
from tests.factories import make_token, token_claims


class StaticJwks:
    """Stands in for PyJWKClient: always returns one public key."""

    def __init__(self, public_key: ec.EllipticCurvePublicKey):
        self._jwk = jwt.PyJWK.from_dict(
            {**jwt.algorithms.ECAlgorithm.to_jwk(public_key, as_dict=True), "alg": "ES256", "kid": "k1"}
        )

    def get_signing_key_from_jwt(self, token: str) -> jwt.PyJWK:
        return self._jwk


@pytest.fixture
def es256_key() -> ec.EllipticCurvePrivateKey:
    return ec.generate_private_key(ec.SECP256R1())


@pytest.fixture
def verifier(es256_key: ec.EllipticCurvePrivateKey) -> TokenVerifier:
    return TokenVerifier(get_settings(), jwks=StaticJwks(es256_key.public_key()))


def test_accepts_hs256_token(verifier: TokenVerifier) -> None:
    sub = uuid.uuid4()
    assert verifier.verify(make_token(sub))["sub"] == str(sub)


def test_accepts_es256_token(verifier: TokenVerifier, es256_key: ec.EllipticCurvePrivateKey) -> None:
    sub = uuid.uuid4()
    token = jwt.encode(token_claims(sub), es256_key, algorithm="ES256", headers={"kid": "k1"})
    assert verifier.verify(token)["sub"] == str(sub)


def test_rejects_es256_token_signed_by_another_key(verifier: TokenVerifier) -> None:
    other = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode(token_claims(uuid.uuid4()), other, algorithm="ES256", headers={"kid": "k1"})
    with pytest.raises(NotAuthenticated):
        verifier.verify(token)


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(make_token(uuid.uuid4(), exp=0), id="expired"),
        pytest.param(make_token(uuid.uuid4(), aud="anon"), id="wrong-audience"),
        pytest.param(make_token(uuid.uuid4(), iss="https://evil.example/auth/v1"), id="wrong-issuer"),
        pytest.param(
            make_token(uuid.uuid4(), secret="another-secret-that-is-also-32-chars-long"), id="bad-sig"
        ),
        pytest.param("not-a-jwt", id="garbage"),
        pytest.param(jwt.encode({"sub": "x"}, None, algorithm="none"), id="alg-none"),
    ],
)
def test_rejects_invalid_tokens(verifier: TokenVerifier, token: str) -> None:
    with pytest.raises(NotAuthenticated):
        verifier.verify(token)


def test_rejects_hs256_when_no_secret_configured(es256_key: ec.EllipticCurvePrivateKey) -> None:
    settings = get_settings().model_copy(update={"supabase_jwt_secret": ""})
    verifier = TokenVerifier(settings, jwks=StaticJwks(es256_key.public_key()))
    with pytest.raises(NotAuthenticated):
        verifier.verify(make_token(uuid.uuid4()))
