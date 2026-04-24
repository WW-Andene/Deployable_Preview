/**
 * framework-detect.js — inspect a repo's package.json and suggest sensible
 * build/output/start defaults so users don't have to guess.
 *
 * Pure logic: takes a parsed package.json object, returns a suggestion.
 * The GitHub fetch lives in the route handler.
 */

"use strict";

/**
 * @param {object} pkg — parsed package.json
 * @returns {{
 *   framework: string,
 *   mode: "static" | "server",
 *   buildCommand: string,
 *   outputDir: string,
 *   startCommand: string,
 *   envTemplate: string,
 *   confidence: "high" | "medium" | "low",
 *   detectedFrom: string[]
 * }}
 */
function detect(pkg) {
  const dep = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
  const scripts = pkg.scripts || {};
  const has = (name) => Object.prototype.hasOwnProperty.call(dep, name);
  const hasScript = (name) => Object.prototype.hasOwnProperty.call(scripts, name);
  const from = [];

  const base = {
    framework: "unknown",
    mode: "static",
    buildCommand: hasScript("build") ? "npm run build" : "",
    outputDir: "dist",
    startCommand: hasScript("start") ? "npm start" : "node index.js",
    envTemplate: "",
    confidence: "low",
    detectedFrom: from
  };

  // ── Next.js ──
  if (has("next")) {
    from.push("next");
    const needsServer = hasScript("start") && /next\s+start/.test(scripts.start);
    return Object.assign(base, {
      framework: "Next.js",
      mode: needsServer ? "server" : "static",
      buildCommand: "npm run build",
      outputDir: needsServer ? ".next" : "out",
      startCommand: needsServer ? "npm start" : "",
      envTemplate: "# Next.js — all NEXT_PUBLIC_ vars are exposed to the browser\nNEXT_PUBLIC_API_URL=\n",
      confidence: "high"
    });
  }

  // ── Nuxt ──
  if (has("nuxt") || has("nuxt3")) {
    from.push("nuxt");
    return Object.assign(base, {
      framework: "Nuxt",
      mode: "server",
      buildCommand: "npm run build",
      outputDir: ".output",
      startCommand: "node .output/server/index.mjs",
      envTemplate: "# Nuxt — NUXT_PUBLIC_ vars are exposed to the browser\nNUXT_PUBLIC_API_BASE=\n",
      confidence: "high"
    });
  }

  // ── SvelteKit ──
  if (has("@sveltejs/kit")) {
    from.push("@sveltejs/kit");
    const adapter = has("@sveltejs/adapter-static") ? "static" : "server";
    return Object.assign(base, {
      framework: "SvelteKit" + (adapter === "static" ? " (static)" : ""),
      mode: adapter === "static" ? "static" : "server",
      buildCommand: "npm run build",
      outputDir: adapter === "static" ? "build" : ".svelte-kit/output",
      startCommand: adapter === "static" ? "" : "node build",
      envTemplate: "# SvelteKit — PUBLIC_ vars exposed to browser\nPUBLIC_API_URL=\n",
      confidence: "high"
    });
  }

  // ── Astro ──
  if (has("astro")) {
    from.push("astro");
    const ssr = has("@astrojs/node");
    return Object.assign(base, {
      framework: "Astro" + (ssr ? " (SSR)" : ""),
      mode: ssr ? "server" : "static",
      buildCommand: "npm run build",
      outputDir: "dist",
      startCommand: ssr ? "node ./dist/server/entry.mjs" : "",
      envTemplate: "# Astro — PUBLIC_ vars exposed to browser\nPUBLIC_API_URL=\n",
      confidence: "high"
    });
  }

  // ── Vite (generic) ──
  if (has("vite")) {
    from.push("vite");
    return Object.assign(base, {
      framework: "Vite",
      mode: "static",
      buildCommand: "npm run build",
      outputDir: "dist",
      startCommand: "",
      envTemplate: "# Vite — VITE_ vars exposed to browser\nVITE_API_URL=\n",
      confidence: "high"
    });
  }

  // ── Create React App ──
  if (has("react-scripts")) {
    from.push("react-scripts");
    return Object.assign(base, {
      framework: "Create React App",
      mode: "static",
      buildCommand: "npm run build",
      outputDir: "build",
      startCommand: "",
      envTemplate: "# CRA — REACT_APP_ vars exposed to browser\nREACT_APP_API_URL=\n",
      confidence: "high"
    });
  }

  // ── Vue CLI ──
  if (has("@vue/cli-service")) {
    from.push("@vue/cli-service");
    return Object.assign(base, {
      framework: "Vue CLI",
      mode: "static",
      buildCommand: "npm run build",
      outputDir: "dist",
      startCommand: "",
      envTemplate: "# Vue CLI — VUE_APP_ vars exposed to browser\nVUE_APP_API_URL=\n",
      confidence: "high"
    });
  }

  // ── Remix ──
  if (has("@remix-run/node") || has("@remix-run/serve")) {
    from.push("@remix-run/*");
    return Object.assign(base, {
      framework: "Remix",
      mode: "server",
      buildCommand: "npm run build",
      outputDir: "build",
      startCommand: "npm start",
      envTemplate: "SESSION_SECRET=\n",
      confidence: "high"
    });
  }

  // ── Angular ──
  if (has("@angular/core")) {
    from.push("@angular/core");
    return Object.assign(base, {
      framework: "Angular",
      mode: "static",
      buildCommand: "npm run build",
      outputDir: "dist",
      startCommand: "",
      confidence: "high"
    });
  }

  // ── Gatsby ──
  if (has("gatsby")) {
    from.push("gatsby");
    return Object.assign(base, {
      framework: "Gatsby",
      mode: "static",
      buildCommand: "npm run build",
      outputDir: "public",
      startCommand: "",
      envTemplate: "# Gatsby — GATSBY_ vars exposed to browser\nGATSBY_API_URL=\n",
      confidence: "high"
    });
  }

  // ── Express / Fastify / Koa / NestJS ──
  if (has("express") || has("fastify") || has("koa") || has("@nestjs/core")) {
    from.push(has("@nestjs/core") ? "@nestjs/core" : has("fastify") ? "fastify" : has("koa") ? "koa" : "express");
    return Object.assign(base, {
      framework: has("@nestjs/core") ? "NestJS" : has("fastify") ? "Fastify" : has("koa") ? "Koa" : "Express",
      mode: "server",
      buildCommand: hasScript("build") ? "npm run build" : "",
      outputDir: "",
      startCommand: hasScript("start") ? "npm start" : "node index.js",
      confidence: "medium"
    });
  }

  // ── Plain static (no build, has index.html) ──
  if (!hasScript("build") && !has("webpack") && !has("parcel")) {
    return Object.assign(base, {
      framework: "Plain static",
      mode: "static",
      buildCommand: "",
      outputDir: ".",
      startCommand: "",
      confidence: "low"
    });
  }

  return base;
}

module.exports = { detect };
