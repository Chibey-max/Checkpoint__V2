# Self-hosted fonts

The fonts are bundled here so `next dev` and `next build` never need `fonts.googleapis.com`. Without them, a slow or offline connection fell back to default fonts. They are loaded with `next/font/local` in `src/app/layout.tsx`.

| Font | Weights | Source | License |
|---|---|---|---|
| Parisienne | 400 | `@fontsource/parisienne` 5.3.0 | SIL OFL 1.1 ([LICENSE-parisienne.txt](LICENSE-parisienne.txt)) |
| Cormorant Garamond | 500, 600, normal and italic | `@fontsource/cormorant-garamond` 5.3.0 | SIL OFL 1.1 ([LICENSE-cormorant-garamond.txt](LICENSE-cormorant-garamond.txt)) |
| Raleway | 400, 500 | `@fontsource/raleway` 5.3.0 | SIL OFL 1.1 ([LICENSE-raleway.txt](LICENSE-raleway.txt)) |
| Cinzel | 500, 600 | `@fontsource/cinzel` 5.3.0 | SIL OFL 1.1 ([LICENSE-cinzel.txt](LICENSE-cinzel.txt)) |

All files are the Latin subset in woff2, the same subset the site asked Google for.
