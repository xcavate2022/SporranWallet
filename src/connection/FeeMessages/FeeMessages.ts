import { BlockchainApiConnection } from '@kiltprotocol/chain-helpers';
import BN from 'bn.js';
import { browser } from 'webextension-polyfill-ts';

import { createOnMessage } from '../createOnMessage';

export const FeeMessageType = {
  feeRequest: 'feeRequest',
};

export interface FeeRequest {
  type: typeof FeeMessageType.feeRequest;
  data: {
    recipient: string;
    amount: string;
  };
}

async function sendFeeRequest(amount: string, recipient: string) {
  return browser.runtime.sendMessage({
    type: FeeMessageType.feeRequest,
    data: { amount, recipient },
  } as FeeRequest);
}

export const onFeeRequest = createOnMessage<FeeRequest, string>(
  FeeMessageType.feeRequest,
);

export async function getFee(amount: BN, recipient: string): Promise<BN> {
  const feeString = await sendFeeRequest(amount.toString(), recipient);
  return new BN(feeString);
}

const fallbackAddressForFee =
  '4tJbxxKqYRv3gDvY66BKyKzZheHEH8a27VBiMfeGX2iQrire';

export async function feeMessageListener(
  data: FeeRequest['data'],
): Promise<string> {
  const { api } = await BlockchainApiConnection.getConnectionOrConnect();

  const tx = api.tx.balances.transfer(
    data.recipient || fallbackAddressForFee,
    new BN(data.amount),
  );

  const { partialFee } = await api.rpc.payment.queryInfo(tx.toHex());
  return partialFee.toString();
}
