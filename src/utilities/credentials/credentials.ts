import { useContext, useEffect, useMemo } from 'react';
import { pick, pull } from 'lodash-es';
import { DidUri, ICredential } from '@kiltprotocol/types';
import { ConfigService } from '@kiltprotocol/config';
import { mutate } from 'swr';

import { storage } from '../storage/storage';
import { jsonToBase64 } from '../base64/base64';

import { CredentialsContext } from './CredentialsContext';

type AttestationStatus = 'pending' | 'attested' | 'revoked' | 'invalid';

export interface Credential {
  // TODO: request is now a misleading name for this property
  request: ICredential;
  name: string;
  cTypeTitle: string;
  attester: string;
  status: AttestationStatus;
  isDownloaded?: boolean;
}

export interface SharedCredential {
  credential: Credential;
  sharedContents: string[];
}

function toKey(hash: string): string {
  return `credential:${hash}`;
}

export const LIST_KEY = toKey('list');

export async function getList(): Promise<string[]> {
  return (await storage.get(LIST_KEY))[LIST_KEY] || [];
}

async function saveList(list: string[]): Promise<void> {
  await storage.set({ [LIST_KEY]: list });
  await mutate(['getCredentials', LIST_KEY]);
}

export async function saveCredential(credential: Credential): Promise<void> {
  const key = toKey(credential.request.rootHash);
  await storage.set({ [key]: credential });
  await mutate(key);

  const list = await getList();
  if (list.includes(key)) {
    await mutate(['getCredentials', LIST_KEY]);
    return;
  }
  list.push(key);
  await saveList(list);
}

export async function getCredentials(keys: string[]): Promise<Credential[]> {
  const result = await storage.get(keys);
  const credentials = pick(result, keys);
  return Object.values(credentials);
}

export async function deleteCredential(credential: Credential): Promise<void> {
  const key = toKey(credential.request.rootHash);
  await storage.remove(key);

  const list = await getList();
  pull(list, key);

  await saveList(list);
}

export function useCredentials(): Credential[] | undefined {
  return useContext(CredentialsContext);
}

export function useIdentityCredentials(did?: DidUri): Credential[] | undefined {
  const all = useCredentials();

  return useMemo(() => {
    if (!all) {
      // storage data pending
      return undefined;
    }
    return all.filter((credential) => credential.request.claim.owner === did);
  }, [all, did]);
}

export function usePendingCredentialCheck(
  credential: Credential | undefined,
): void {
  useEffect(() => {
    if (!credential || credential.status !== 'pending') {
      return;
    }
    (async () => {
      const api = ConfigService.get('api');
      const attestation = await api.query.attestation.attestations(
        credential.request.rootHash,
      );
      if (attestation.isNone) return;
      if (attestation.unwrap().revoked.isTrue) {
        await saveCredential({ ...credential, status: 'revoked' });
      } else {
        await saveCredential({ ...credential, status: 'attested' });
      }
    })();
  }, [credential]);
}

interface CredentialDownload {
  name: string;
  url: string;
}

export function getCredentialDownload(
  credential: Credential,
): CredentialDownload {
  const name = `${credential.name}-${credential.cTypeTitle}.json`;

  const blob = jsonToBase64(credential);
  const url = `data:text/json;base64,${blob}`;

  return { name, url };
}
