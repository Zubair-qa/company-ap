# Company AP Automation - Figma Flow Map

This file maps the updated clickable prototype for the scoped AP workflow:

Department User -> AI/Validation -> AP Finance -> CFO -> Payment Gateway/Bank -> Xero/Notify/Close.

## Prototype Frames

1. Login and role entry
   - Purpose: role-based login plus new department registration.
   - Sign in: demo users for Engineering, Procurement, AP Clerk, CFO and Company Admin.
   - Register department: captures new department name, code, requester email and approval document owner.
   - Primary action: Login -> role-scoped home screen.

2. Department Home
   - Purpose: department-scoped invoice/ticket board.
   - Columns: Draft/Rework, AI Validation, Finance/AP Processing, Paid/Closed.
   - Primary action: Create invoice -> Invoice Intake.
   - Secondary action: Open incomplete request -> AI Validation Review.

3. Invoice Intake
   - Purpose: create invoice request from selected source/type.
   - Slip/PDF mode: upload document and auto-populate extracted fields.
   - Manual mode: show full invoice and PO fields.
   - Excel/Google Sheet mode: hide manual invoice fields and show import/column-mapping inputs.
   - Mandatory document package: department approval document, PO, invoice/slip, GR/receiving proof and vendor bank/supporting proof.
   - Agent: Document Intake / OCR Agent.

4. AI Validation Review
   - Purpose: department reviews extracted invoice fields, synced PO fields and required documents.
   - AI output: verification percentage, missing-document list, duplicate check, PO sync result, vendor/account confidence.
   - Primary action: Submit for AI validation -> Department Home status update.
   - Agent: Validation / Risk Agent.

5. AP Kanban Board
   - Purpose: AP Finance sees validated requests and operational workflow statuses.
   - Columns: AI validated docs, Vendor/PO/Account, WHT and voucher, CFO sign pending.
   - Primary action: Open ticket -> AP Ticket Detail.
   - Access: AP Clerk and Company Admin.

6. AP Ticket Detail
   - Purpose: AP workspace for validation, WHT/voucher, Xero payload, comments, attachments and payment preparation.
   - Primary action: Prepare payment -> CFO Sign.
   - Agent: AP Copilot, WHT/Voucher Agent, Xero Sync Agent.

7. CFO Sign
   - Purpose: CFO sees payment risk summary and signs manually.
   - Primary action: Sign payment -> Payment and Close.
   - Human gate: CFO approval.

8. Payment and Close
   - Purpose: payment gateway/bank execution, confirmation, reconciliation, Xero paid marking and requester notification.
   - Primary action: View close report -> Reports Dashboard.
   - Agent: Payment Gateway Agent, Reconciliation Agent, Notification Agent.

9. Agent Monitor
   - Purpose: admin monitor for jobs, failures, retries and governance.
   - Access: Company Admin.

10. Reports Dashboard
   - Purpose: leadership view of cycle time, missing-document loops, manual effort reduction and agent performance.
   - Access: AP Clerk, CFO, Company Admin.

11. AP Chat Assistant
   - Purpose: conversational assistant grounded in ticket, invoice, PO, documents, comments and activity data.
   - Limits: cannot CFO-sign, override tax, modify vendor bank accounts or release payments.

## Critical Clickable Prototype Paths

- Happy path: Login -> Department Home -> Invoice Intake -> AI Validation Review -> AP Board -> Ticket Detail -> CFO Sign -> Payment and Close -> Dashboard.
- Missing docs path: Invoice Intake / AI Validation Review -> Department Home Draft/Rework -> attach missing docs -> AI Validation Review.
- AP path: AP Board -> Ticket Detail -> Prepare Payment -> CFO Sign.
- CFO path: CFO Sign -> Payment and Close.
- Admin monitoring path: Dashboard / AP Board -> Agent Monitor.
- Conversational path: any ticket context -> AP Chat Assistant.

## Role-Based Access Matrix

| Role | Department Scope | Allowed Frames |
|---|---|---|
| Department User | Own department only | Department Home, Invoice Intake, AI Validation Review, AP Chat Assistant |
| AP Clerk | Finance/AP operations | AP Kanban Board, AP Ticket Detail, Payment and Close, Reports Dashboard, AP Chat Assistant |
| CFO | Finance approval | CFO Sign, Payment and Close, Reports Dashboard, AP Chat Assistant |
| Company Admin | All departments | All protected frames |

## Authentication Behavior

- User must login before accessing any protected frame.
- Sidebar navigation is filtered after login.
- Top bar shows logged-in user, role and department.
- Logout returns user to Login frame.
- Unauthorized clicks redirect user to their role home frame with an access-blocked message.
- Department-specific sample records update based on logged-in department.
- New department registration is represented on the sign-in screen and routes the prototype to the Procurement demo account.

## Human vs Agent Ownership

- Human work:
  - Department user creates/fixes invoice requests and uploads required documents.
  - AP clerk reviews exceptions, validates finance data and accepts/adjusts recommendations.
  - CFO signs payment.

- AI agent work:
  - OCR/extraction from invoice, slip, PDF, email and sheet import.
  - Required document completeness check.
  - Duplicate invoice detection.
  - PO/invoice/vendor/account validation.
  - Verification percentage and missing-item summary.
  - WHT/voucher draft.
  - Xero payload/error assistance.
  - Payment reconciliation.
  - Notifications, SLA monitoring and reporting.

## Figma Component Set

- Navigation sidebar
- Top bar
- Sign in / Register department tabs
- Role selector
- Stat card
- Kanban column
- Ticket card
- Badge: AI Ready, Needs Review, High Risk, Human Approval, Payment Complete
- AI agent panel
- AI validation score ring
- Required document checklist
- Field confidence card
- Document preview
- Timeline/activity row
- Chat bubble
- Primary/secondary/destructive buttons
