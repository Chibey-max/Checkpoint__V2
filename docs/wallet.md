# Wallet integration (P-0.3)

**Decision:** `@hot-labs/near-connect` 0.12 on testnet. The fallback (`@near-wallet-selector/core` 10.x) is not needed unless the manual check below fails.

## What the code does

- `apps/web/src/lib/wallet.tsx` creates one `NearConnector` on the client only, because it uses `window`, iframes and IndexedDB:
  ```ts
  new NearConnector({
    network: "testnet",
    providers: { testnet: [NEXT_PUBLIC_NEAR_RPC_URL] },
    features: { testnet: true, signAndSendTransaction: true }, // hide wallets that can't do testnet
    autoConnect: true,
  });
  ```
- **No limited-access key at sign-in (FR-UI01).** The `signIn: { contractId, methodNames }` option is deprecated in 0.12, and we don't pass it. Every call that matters attaches 1 yocto or a storage deposit, so the wallet has to sign with a full-access key anyway.
- Transactions use the connector's own action format, so the web app needs no near-api-js action builders:
  ```ts
  wallet.signAndSendTransaction({
    network: "testnet", signerId, receiverId,
    actions: [{ type: "FunctionCall", params: { methodName, args, gas: "30000000000000", deposit: "1" } }],
  });
  ```
  All builders live in `apps/web/src/lib/tx.ts`. `wallet:signIn` and `wallet:signOut` events update the account shown in the nav.
- View calls don't go through the wallet. `apps/web/src/lib/near.ts` uses near-api-js 7.4 `JsonRpcProvider.callFunction({ contractId, method, args, blockQuery: { finality: "final" } })`.

## Checked so far (5 Nov)

| Check | Result |
|---|---|
| Package API matches this code (types read from the published 0.12.0 and near-api-js 7.4.0 tarballs) | ✅ `tsc --noEmit` and `next build` pass |
| Connector loads in the browser and reaches the ready state | ✅ The "Sign in" button renders on `/wallet-check` in headless Chrome |
| Testnet RPC `https://rpc.testnet.fastnear.com` works without a key (D-04 candidate) | ✅ `status` returns `chain_id: testnet` |
| Sign in with Meteor or Intear on testnet and see the account ID | ⏳ Needs a person with a wallet: open `/wallet-check` |
| Sign a FunctionCall with a deposit from the browser | ⏳ Same page, step 2 |

## How to run the manual check

1. `pnpm --filter web dev`, then open <http://localhost:3000/wallet-check>.
2. **Sign in.** Pick Meteor or Intear and choose your testnet account. The account ID should appear on the page and in the nav.
3. Step 2: click **Use wrap.testnet** (until cpUSD exists), then **Send storage_deposit**. The wallet should ask you to approve a call to `storage_deposit` with about 0.00125 NEAR attached. When it finishes, the page links the transaction on testnet.nearblocks.io.
4. `cpusd.cpdemo.testnet` is deployed (H4): repeat step 3 with the default token. That is also the real "Register on cpUSD" flow for the Vault page.
5. Write the result below: wallet, account, transaction hash, and anything odd (popups, network switching).

## Results of the manual check

_Not run yet._
