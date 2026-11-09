# homehub

Household management PWA (static `index.html` + Supabase).

- `index.html`, `sw.js`: the app and its service worker
- `backend/`: Supabase SQL (`supabase-setup.sql`, then `supabase-setup-2.sql`) and the `homehub-ai` edge function
- `tests/smoke.js`: automated smoke test (see `TESTING.md`)
- `TESTING.md`: full manual and automated test plan

## Smart Inventory Input

Inventory can be filled three ways: typed in, by scanning a product barcode, or by photographing a shopping receipt. Scans always end in a review screen before anything is saved.

- **Barcode**: live camera on browsers that support `BarcodeDetector` (Chrome/Android), otherwise type the number. Names come from Open Food Facts; products it does not know are named once and remembered per household (`barcodes` in the household state).
- **Receipt**: photo or upload is sent to the `homehub-ai` edge function (`mode: "receipt"`, Gemini vision). Typed or pasted receipt lines work offline.
- **Deploying the receipt reader**: paste `backend/homehub-ai-function.ts` over the existing `homehub-ai` function in Supabase (Edge Functions) and keep the `GEMINI_API_KEY` secret.
