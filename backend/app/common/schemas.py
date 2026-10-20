"""Base Pydantic schemas and the error response model."""

from pydantic import BaseModel, ConfigDict


class Schema(BaseModel):
    """Response schemas read straight from ORM objects."""

    model_config = ConfigDict(from_attributes=True)


class ErrorResponse(BaseModel):
    """The body of every error response: a readable message and a stable code."""

    detail: str
    code: str
