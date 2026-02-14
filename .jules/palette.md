## 2024-05-23 - Global Component Accessibility & Form UX
**Learning:** Global components like Header and Footer often contain icon-only links (socials, logo) and simple inputs (newsletter) that are easily overlooked for accessibility. Standardizing on `aria-label` and semantic (even if `sr-only`) labels is critical. Also, wrapping inputs in `<form>` tags is essential for 'Enter' key submission support, which is a common user expectation.
**Action:** Always verify that icon-only interactive elements have `aria-label` and that inputs are wrapped in `<form>` elements for keyboard accessibility.
