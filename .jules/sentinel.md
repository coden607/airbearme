# Sentinel Journal - Security Learnings

## 2025-05-15 - [Privilege Escalation and Info Leakage]
**Vulnerability:** Mass assignment in registration allowing 'admin' role selection and information leakage in health check endpoints disclosing environment config status.
**Learning:** Shared schemas and public endpoints must be carefully audited for sensitive fields. Defaulting to 'user' role is not enough if the client can still override it via the request body. Health checks should never disclose the presence or absence of specific internal services or keys.
**Prevention:** Always use restrictive Zod schemas for public endpoints and explicitly strip sensitive fields (like 'role') from request bodies before processing profile synchronizations. Sanitize health check responses to return only minimal status indicators.
