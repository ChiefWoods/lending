# Lending

Borrow-lending protocol for [Turbin3 Builders Cohort](https://turbin3.com/).

[Live Website](https://lending-app-gilt.vercel.app/)

[Program on Solana Explorer](https://explorer.solana.com/address/DdjBM9scqgaLvE4iskb1cYqqJYFMScRXmi1xnvHPsANt?cluster=devnet)

[Source Repository](https://github.com/ChiefWoods/lending)

## How to Use

### Prerequisites

Have a user account created.

![User Account](images/create_user.png)

### Bank Action

1. Pick a bank

![Choose Bank](images/choose_bank.png)

2. Choose an action and enter amount in atomic units

![Choose Action](images/choose_action_and_amount.png)

3. Sign transaction

![Sign Transaction](images/sign_transaction.png)

4. Success

![Success toast](images/success_toast.png)

## Design Choices

- protocol only supports SOL-USDC at the moment, collateral can be increased by depositing to the other pair, eg: deposit to SOL to borrow USDC
- health factors are represented differently by each bank
- Pyth prices are fetched on client-side
- Solana RPC URL is exposed on both client and server side, but can easily be configured to handle whitelisted domains

## Planned Changes

- improve UI account state changes after confirming a transaction 
- improve UI when taking actions (balance in UI amount, different state when account balance is insufficient)
- set global health factor through a single config account
- add liquidate page
- add thorough support for Wrapped SOL (both normal and Extensions)
- replace hardcoded SOL-uSDC pair with dynamic base and quote tokens
- improve collateral and health factor calculation by taking account of all tokens in a pool
- fetch Pyth prices on server-side to mask Hermes RPC URL

## Built With

### Languages

- [![Rust](https://img.shields.io/badge/Rust-f75008?style=for-the-badge&logo=rust)](https://www.rust-lang.org/)
- [![TypeScript](https://img.shields.io/badge/TypeScript-ffffff?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
- [![React](https://img.shields.io/badge/React-23272f?style=for-the-badge&logo=react)](https://react.dev/)

### Libraries

- [@coral-xyz/anchor](https://www.anchor-lang.com/)
- [@solana/web3.js](https://solana-labs.github.io/solana-web3.js/)
- [@solana/spl-token](https://solana-labs.github.io/solana-program-library/token/js/)
- [solana-bankrun](https://kevinheavey.github.io/solana-bankrun/)
- [anchor-bankrun](https://kevinheavey.github.io/solana-bankrun/)
- [spl-token-bankrun](https://github.com/metaDAOproject/spl-token-bankrun)
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

1. Update your Solana CLI, Bun toolkit and avm to the latest version

```bash
solana-install update
bun upgrade
avm update
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

5. In `/app`, configure `.env` files

```bash
cp .env.example .env.development; cp .env.example .env.production
```

#### Testing

Run all `.test.ts` files under `/tests`.

```bash
bun test
```

Note: certain test parameters may have to be adjusted as the SOL-USD and USDC-USD prices fluctuate.

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
