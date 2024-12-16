import { makeAnvilTest, simulateAndWriteContractWithRetries } from "./test";
import { describe } from "node:test";
import { base } from "viem/chains";
import { expect } from "vitest";
import { parseEther } from "viem";
import { buyTokens } from "./buy";
import { getBuyQuote } from "./quote";
import { getMarketTypeAndPoolAddress } from "./pool/transaction";
import { BASE_MAINNET_FORK_BLOCK_NUMBER, forkUrls } from "./test/constants";
import { SlippageExceededError } from "./errors";

describe("buy wow token", () => {
  makeAnvilTest({
    forkBlockNumber: BASE_MAINNET_FORK_BLOCK_NUMBER,
    forkUrl: forkUrls.baseMainnet,
    anvilChainId: base.id,
  })(
    "can buy token",
    async ({ viemClients: { publicClient, walletClient } }) => {
      const tokenAddress = "0x01aa2894773c091cc21a8880b3633ac173727440";
      const ethAmount = "1";
      const { marketType, poolAddress } = await getMarketTypeAndPoolAddress({
        tokenAddress,
        publicClient,
      });
      const quote = await getBuyQuote({
        chainId: base.id,
        publicClient,
        tokenAddress,
        amount: parseEther(ethAmount),
        marketType,
        poolAddress,
      });

      const params = await buyTokens({
        chainId: base.id,
        tokenRecipientAddress: walletClient.account?.address!,
        tokenAddress,
        refundRecipientAddress: walletClient.account?.address!,
        originalTokenQuote: quote,
        slippageBps: 100n,
        ethAmount,
        publicClient,
        account: walletClient.account?.address!,
      });
      const receipt = await simulateAndWriteContractWithRetries({
        parameters: params,
        walletClient,
        publicClient,
      });

      expect(receipt.status).toBe("success");
    },

    20_000,
  );

  makeAnvilTest({
    forkBlockNumber: BASE_MAINNET_FORK_BLOCK_NUMBER,
    forkUrl: forkUrls.baseMainnet,
    anvilChainId: base.id,
  })(
    "throws SlippageExceededError when quote becomes stale",
    async ({ viemClients: { publicClient, walletClient } }) => {
      const tokenAddress = "0x01aa2894773c091cc21a8880b3633ac173727440";
      const { marketType, poolAddress } = await getMarketTypeAndPoolAddress({
        tokenAddress,
        publicClient,
      });

      // Get initial quote for 1 ETH
      const staleQuote = await getBuyQuote({
        chainId: base.id,
        publicClient,
        tokenAddress,
        amount: parseEther("1"),
        marketType,
        poolAddress,
      });

      // Buy 5 ETH to significantly impact the price
      const largeAmount = "5";
      const largeQuote = await getBuyQuote({
        chainId: base.id,
        publicClient,
        tokenAddress,
        amount: parseEther(largeAmount),
        marketType,
        poolAddress,
      });

      const largeParams = await buyTokens({
        chainId: base.id,
        tokenRecipientAddress: walletClient.account?.address!,
        tokenAddress,
        refundRecipientAddress: walletClient.account?.address!,
        originalTokenQuote: largeQuote,
        slippageBps: 100n,
        ethAmount: largeAmount,
        publicClient,
        account: walletClient.account?.address!,
      });

      // Execute the large buy to change the price
      await simulateAndWriteContractWithRetries({
        parameters: largeParams,
        walletClient,
        publicClient,
      });

      // Try to buy with the stale quote - should throw SlippageExceededError
      await expect(
        buyTokens({
          chainId: base.id,
          tokenRecipientAddress: walletClient.account?.address!,
          tokenAddress,
          refundRecipientAddress: walletClient.account?.address!,
          originalTokenQuote: staleQuote,
          slippageBps: 100n,
          ethAmount: "1",
          publicClient,
          account: walletClient.account?.address!,
        }),
      ).rejects.toThrow(SlippageExceededError);
    },
    30_000,
  );
});
