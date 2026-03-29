# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sunbi Store App — a Google AI Studio-generated web application that uses the Gemini API via a Service Worker proxy architecture.

- **Deployed at**: https://service-74866323548.us-west1.run.app
- **Hosting**: Google Cloud Run (us-west1)

## Architecture

```
Browser → Service Worker (_service-worker.js) → /gemini-api-proxy → Google Generative Language API
```

The Service Worker intercepts requests to `generativelanguage.googleapis.com` and routes them through a local proxy endpoint (`/gemini-api-proxy` on port 8080), handling header management, body serialization, and error responses (502/500).

## Current State

This repository is in early setup. The deployed app exists on Cloud Run but source code has not yet been committed locally.
