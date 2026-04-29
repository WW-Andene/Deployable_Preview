---
name: deliver-infrastructure
description: >
  Delivery infrastructure protocol: CI/CD, APK builder, signing, deployment, build-run-install verification. The "can the user actually use it" gate. Loaded on demand.
---

> **MODULE: deliver-infrastructure** — Domain protocol for the H5W unified system.
>
> **Invoked when:** Chief Guide §TRIAGE detects delivery work — "deploy", "build APK", "CI/CD", "can't install", "set up delivery". Auto-invoked by §AUTO when no CI/CD detected on the project.
>
> **Receives:** Chief Guide §0 (filled), §I calibration (classified).
> **Uses:** Chief Guide §LAW, §FMT, §SRC, §REV, §VER, §DOC — do NOT re-derive.
> **Returns:** Findings/actions in §FMT format → H5W-QUEUE.md and H5W-LOG.md.
>
> **In §AUTO mode:** the §AUTO protocol (references/auto-mode.md) governs interactive vs autonomous behavior.
> See the §AUTO protocol (references/auto-mode.md) for FULL/GUIDED routing and the activation gate.

---

## §DELIVER — DELIVERY INFRASTRUCTURE PROTOCOL

> **The app isn't done when the code works. It's done when the user can use it.**
> A working codebase without delivery infrastructure is a project, not a product.
> This section is MANDATORY for both §BUILD (new apps) and audits (existing apps).

### The Delivery Question

Before any session is considered complete, Claude must answer:

**"Can the user (or their users) actually get a working artifact from this code?"**

If no → delivery infrastructure is the #1 priority finding.

### Platform Delivery Checklists

**Android:**
```
[ ] build.gradle: applicationId, versionCode, versionName set
[ ] build.gradle: signingConfigs for release (or documented setup)
[ ] build.gradle: buildTypes (debug + release) with ProGuard/R8
[ ] build.gradle: minSdk, targetSdk, compileSdk correct
[ ] AndroidManifest.xml: permissions, exported activities
[ ] .github/workflows/android-build.yml: GitHub Actions APK builder
      - Trigger: push to main + manual dispatch
      - Steps: checkout → setup JDK → setup Gradle → build → upload artifact
      - Signing: via GitHub Secrets (keystore base64, passwords)
[ ] Keystore: generated or documented how to generate
[ ] README: how to build locally (./gradlew assembleDebug)
[ ] README: how to install APK on device
[ ] README: how CI builds work
```

**GitHub Actions template for Android APK:**
```yaml
name: Build APK
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
      - uses: gradle/actions/setup-gradle@v3
      - run: chmod +x gradlew
      - run: ./gradlew assembleRelease
        # For signed builds: add signing config + secrets
      - uses: actions/upload-artifact@v4
        with:
          name: app-release
          path: app/build/outputs/apk/release/*.apk
```

**Web (Vercel/Netlify/static):**
```
[ ] package.json: build script produces deployable output
[ ] Deployment config: vercel.json / netlify.toml / equivalent
[ ] Environment variables: documented, .env.example provided
[ ] Build verification: npm run build succeeds clean
[ ] Deploy preview: branch deploys configured (if Vercel/Netlify)
[ ] README: how to deploy (one-command if possible)
[ ] README: how to run locally (npm install && npm run dev)
[ ] Domain/URL: configured or documented
```

**iOS:**
```
[ ] Xcode project: bundle ID, version, build number set
[ ] Signing: development + distribution certificates documented
[ ] Fastlane or GitHub Actions: automated build pipeline
[ ] TestFlight or direct IPA: distribution method configured
[ ] README: how to build locally (xcodebuild or Xcode)
[ ] README: how to distribute to testers
```

**Cross-platform (Flutter/RN):**
```
[ ] Platform-specific build configs for BOTH Android and iOS
[ ] CI/CD builds BOTH platforms
[ ] README covers building for each platform
```

### When to Run §DELIVER

| Context | When §DELIVER Runs |
|---------|-------------------|
| §BUILD B4 (Scaffold) | Set up CI/CD and delivery as part of scaffolding |
| §BUILD B9 (Launch Gate) | Verify delivery works: CI builds, artifact generated |
| Audit (existing app) | Check if delivery infrastructure exists — missing = HIGH finding |
| §AUTO continuous | If no delivery infrastructure detected → create it before feature work |
| §SIM.6 (50 Questions) | Question 51: "Can the user actually build and install this?" |

### Delivery as a Finding

When auditing an existing app with no delivery infrastructure:

```
FINDING: F-[NNN]
MODULE: H5W
SEVERITY: HIGH
CONFIDENCE: confirmed
SOURCE: [CODE: missing .github/workflows/ or equivalent]
How:   No CI/CD pipeline. Code can't be built into a distributable artifact
       without manual steps the developer may not know.
Who:   The developer (can't distribute) and all end users (can't install).
Will:  App is unusable despite working code. All other improvements are moot.
What:  Missing delivery infrastructure. Need: CI/CD pipeline, build config,
       signing setup, deployment target, README instructions.
When:  Blocks ALL user access to the app.
Where: Project root — missing .github/workflows/, deployment config.
FIX:   Create platform-appropriate CI/CD (see §DELIVER checklists).
TIER:  T1 (additive — new files only)
EXPANSION: After CI/CD works, verify the built artifact actually runs.
```

**Severity: HIGH, not enhancement.** A beautiful, bug-free app that nobody can
install is worse than an ugly app with a working APK. Delivery is infrastructure,
not polish.

### The Build-Run-Install Test

After delivery infrastructure is set up, verify:

```
BUILD-RUN-INSTALL TEST:
  1. Clone the repo fresh (or simulate: delete node_modules/build)
  2. Follow README instructions exactly
  3. Does the build succeed?
  4. Does the artifact exist? (APK, bundle, deployed URL)
  5. Can the artifact be installed/accessed?
  6. Does the app launch and show the home screen?
  7. Does the CI/CD pipeline produce the same result?

  ANY failure → fix before other work continues.
```

---

