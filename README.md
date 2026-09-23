# LMS Hub

A learning management and course-selling platform: a Node.js REST API with a
PostgreSQL database, and a Vue 3 web application that serves both the public
course website and the multi-role dashboard.

**Start with `Documentation/index.html`.** It is a short quick-start page that
links to the three PDF manuals included with this purchase. Those manuals, not
this file, are the real documentation.

## What is in this folder

```
lmshub/
  lmshub-be/     Node.js + Express REST API, PostgreSQL migrations, seeds
  lmshub-fe/     Vue 3 + Tailwind single-page app (public site + dashboard)
  README.md      this file
```

## Requirements

| Component  | Version                                              |
|------------|------------------------------------------------------|
| Node.js    | 20 or newer                                          |
| PostgreSQL | 14 or newer                                          |
| Redis      | Optional in development, recommended in production   |

These services are not included in this purchase. You provide and pay for the
hosting they run on.

## Installing

The supported route is the browser-based wizard. Serve the backend, open
`/install`, and it checks the requirements, tests the database connection, runs
the migrations, creates the first administrator, and writes `.env` for you —
including freshly generated JWT signing secrets. It locks itself once a super
admin exists.

The installation manual in `Documentation/` covers this in full, along with the
manual command-line route, production deployment behind a reverse proxy, and how
to point a build at a different API address.

If you install by hand rather than with the wizard, copy
`lmshub-be/.env.example` to `lmshub-be/.env` and read the comments in it. Two
lines matter more than the rest: `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
must each be replaced with a random value of at least 32 characters. The server
refuses to start in production while either still holds a placeholder — the
defaults are printed in source code that every buyer receives, so an installation
that keeps them is signing its tokens with a public key.

## Configuration after installation

Most settings live in the admin panel rather than in files. Payment gateways in
particular — Stripe, PayPal, Razorpay, Paystack, Flutterwave, Mollie and Midtrans
— are configured under **Settings → Payment Methods**, where you enable a
gateway, paste its credentials, and copy a ready-made webhook URL without editing
any file or restarting the server.

## Mobile app

A Flutter application for Android and iOS is available as a companion item on
CodeCanyon, **LMS Hub Mobile | Flutter LMS App for Students & Instructors**. It
is a client for this backend and is not required to run this platform.

## Licence and support

See `Licensing/LICENSE.txt` for what your licence permits, and
`Licensing/CREDITS.md` for the licences of the third-party components used.
Support is provided through this item's support tab on the marketplace.

© 2026 Manufactur Digital Hub. All rights reserved.
