# Company AP Automation - Figma Design Handoff

This folder contains a Figma-ready clickable prototype package for the complete end-to-end AP Automation user journey.

## Files

- `index.html` - clickable local prototype covering the full app journey.
- `figma_flow_map.md` - frame order, prototype paths, human/agent ownership and component list.
- `design_tokens.json` - colors, typography, badges, icons and frame order for Figma setup.

## Prototype Coverage

The demo includes:

- Login and role entry
- Department home
- Invoice intake
- Invoice + PO review
- Department head board
- Head approve/reject flow
- AP Kanban board
- AP ticket detail
- CFO sign
- Payment gateway and close
- Agent monitor
- Reports dashboard
- AP chat assistant

## Figma Build Notes

Use the HTML prototype as the visual reference and `figma_flow_map.md` as the click map. The recommended Figma structure is:

- Page 1: Design System
- Page 2: Prototype Frames
- Page 3: Agentic Workflow Diagrams
- Page 4: Notes and Edge Cases

Keep approval gates visually distinct:

- Human work: amber person icon
- AI agent work: teal robot/agent icon
- Semi-autonomous assist: indigo assist icon
- Mandatory approval: red approval marker

