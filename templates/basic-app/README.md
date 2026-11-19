# {{projectName}}

Generated with the StellarForge `basic-app` template.

## Requirements

- Node.js 22.13 or newer

## Start

```bash
npm start
```

The starter prints the configured Stellar Testnet Horizon and RPC endpoints. It does not require or generate wallet secret keys.

## Validate

```bash
npm run check
npm test
```

## Port already in use (EADDRINUSE)

This starter opens no listening socket at all — `npm start` only prints the configured endpoints. `EADDRINUSE` cannot occur with the starter as generated, and the documented environment variables point at remote Stellar services, not local ports.

If you add your own local server to this application, pick a free port entirely under your control; if it collides with another process, the operating system will report `EADDRINUSE` just like for any other application. Resolve such collisions by changing the port you configure, or by stopping only the process you recognize as your own previous instance.

## Notes

This template is intended as a minimal starting point for Stellar dApps. For production deployments, configure your own RPC and Horizon endpoints and secure any signing keys appropriately.

## Network configuration

The starter defaults to Stellar Testnet:

- Horizon: `https://horizon-testnet.stellar.org`
- RPC: `https://soroban-testnet.stellar.org`
- Network passphrase: `Test SDF Network ; September 2015`

Override the public network endpoints with `STELLAR_HORIZON_URL`, `STELLAR_RPC_URL`, or `STELLAR_NETWORK_PASSPHRASE` when needed; `.env.example` documents the defaults and contains only public Testnet values.

Do not commit private keys, seed phrases, signing secrets, or production credentials to the project.
