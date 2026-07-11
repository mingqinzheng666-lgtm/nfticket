import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractIpfsCid,
  resolveIpfsUri,
  normalizeIpfsRef,
  fetchJsonFromIpfs,
} from "./ipfs";

describe("ipfs pure helpers", () => {
  it("resolveIpfsUri turns ipfs:// into a gateway URL and passes http through", () => {
    expect(resolveIpfsUri("ipfs://QmAbc")).to.equal("https://gateway.pinata.cloud/ipfs/QmAbc");
    expect(resolveIpfsUri("https://example.com/x.png")).to.equal("https://example.com/x.png");
    expect(resolveIpfsUri("")).to.equal("");
  });

  it("normalizeIpfsRef prefixes a bare CID with ipfs://", () => {
    expect(normalizeIpfsRef("QmAbc")).to.equal("ipfs://QmAbc");
    expect(normalizeIpfsRef("ipfs://QmAbc")).to.equal("ipfs://QmAbc");
    expect(normalizeIpfsRef("https://x/y")).to.equal("https://x/y");
  });

  it("extractIpfsCid pulls the CID from ipfs:// and gateway URLs", () => {
    expect(extractIpfsCid("ipfs://QmAbc")).to.equal("QmAbc");
    expect(extractIpfsCid("https://gateway.pinata.cloud/ipfs/QmXyz")).to.equal("QmXyz");
    expect(extractIpfsCid("QmBare")).to.equal("QmBare");
  });
});

describe("fetchJsonFromIpfs caching", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ hello: "world" }) }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches a given URI only once and caches the result", async () => {
    const uri = `ipfs://QmCache-${Math.random()}`;
    const a = await fetchJsonFromIpfs(uri);
    const b = await fetchJsonFromIpfs(uri);
    expect(a).to.deep.equal({ hello: "world" });
    expect(b).to.deep.equal({ hello: "world" });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns null for an empty ref without fetching", async () => {
    const out = await fetchJsonFromIpfs("");
    expect(out).to.equal(null);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
