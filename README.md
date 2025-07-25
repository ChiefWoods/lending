# Lending

Borrow-lending protocol for [Solana Development Bootcamp](https://github.com/solana-developers/developer-bootcamp-2024).

[Live Website](https://lending-app-gilt.vercel.app/)

[Program on Solana Explorer](https://explorer.solana.com/address/DdjBM9scqgaLvE4iskb1cYqqJYFMScRXmi1xnvHPsANt?cluster=devnet)

[Source Repository](https://github.com/ChiefWoods/lending)

## Built With

### Languages

- [![Rust](https://img.shields.io/badge/Rust-f75008?style=for-the-badge&logo=rust)](https://www.rust-lang.org/)
- [![TypeScript](https://img.shields.io/badge/TypeScript-ffffff?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
- [![React](https://img.shields.io/badge/React-23272f?style=for-the-badge&logo=react)](https://react.dev/)

### Libraries

- [@coral-xyz/anchor](https://www.anchor-lang.com/)
- [@solana/web3.js](https://solana-foundation.github.io/solana-web3.js/)
- [@solana/spl-token](https://solana-labs.github.io/solana-program-library/token/js/)
- [litesvm](https://github.com/LiteSVM/litesvm/tree/master/crates/node-litesvm)
- [anchor-litesvm](https://github.com/LiteSVM/anchor-litesvm/)
- [@solana/wallet-adapter-react](https://github.com/anza-xyz/wallet-adapter)
- [@pythnetwork/hermes-client](https://pyth.network/)
- [@pythnetwork/price-service-sdk](https://pyth.network/)
- [Next.js](https://nextjs.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Zod](https://zod.dev/)

### Crates

- [anchor-lang](https://docs.rs/anchor-lang/latest/anchor_lang/)
- [anchor-spl](https://docs.rs/anchor-spl/latest/anchor_spl/)
- [pyth-solana-receiver-sdk](https://docs.rs/pyth-solana-receiver-sdk/latest/pyth_solana_receiver_sdk/)

### Test Runner

- [![Bun](https://img.shields.io/badge/Bun-000?style=for-the-badge&logo=bun)](https://bun.sh/)

## Getting Started

### Prerequisites

1. Update your Solana CLI, avm and Bun toolkit to the latest version

```bash
agave-install init 2.1.20
avm use 0.31.1
bun upgrade
```

### Setup

1. Clone the repository

```bash
git clone https://github.com/ChiefWoods/lending.git
```

2. Install all dependencies

```bash
bun i
```

3. Resync your program id

```bash
anchor keys sync
```

4. Build the program

```bash
anchor build
```

> [!NOTE]  
> Use the test build of the program when running tests.
> ```
> bun run build:test
> ```

5. In `/app`, configure `.env` files

```bash
cp .env.example .env.development; cp .env.example .env.production
```

#### Testing

Run all `.test.ts` files under `/tests`.

```bash
bun test
```

#### Deployment

1. Configure to use localnet

```bash
solana config set -ul
```

2. Deploy the program

```bash
anchor deploy
```

3. Optionally initialize IDL

```bash
anchor idl init -f target/idl/lending.json <PROGRAM_ID>
```

#### Development

Start development server.

```bash
bun run dev
```

#### Build

Create production build.

```bash
bun run build
```

#### Preview

Start preview server.

```bash
bun run start
```

## Issues

View the [open issues](https://github.com/ChiefWoods/lending/issues) for a full list of proposed features and known bugs.

## Acknowledgements

### Resources

- [Shields.io](https://shields.io/)

### Hosting

- [Vercel](https://vercel.com/)

## Contact

[chii.yuen@hotmail.com](mailto:chii.yuen@hotmail.com)
