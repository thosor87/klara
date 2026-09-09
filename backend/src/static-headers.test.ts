import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import type { FastifyReply } from "fastify";
import { setStaticHeaders } from "./static-headers.js";

/**
 * @fastify/static v10 übergibt an `setHeaders` einen FastifyReply — v9 gab noch
 * die rohe ServerResponse. Ein Fake, der NUR `header()` kennt, hält diesen
 * Vertrag fest: greift der Callback auf `setHeader()` zurück, schlägt der Test
 * fehl statt den Cache-Header im Betrieb still zu verschlucken.
 */
function fakeReply() {
  const header = vi.fn();
  return { reply: { header } as unknown as FastifyReply, header };
}

const asset = (name: string) => path.join("/srv", "dist", "assets", name);

describe("setStaticHeaders", () => {
  it("markiert content-gehashte Assets als unveränderlich", () => {
    const { reply, header } = fakeReply();

    setStaticHeaders(reply, asset("index-CXQ17pGX.js"));

    expect(header).toHaveBeenCalledWith(
      "Cache-Control",
      "public, max-age=31536000, immutable",
    );
  });

  it("lässt Dateien außerhalb von /assets/ unangetastet", () => {
    const { reply, header } = fakeReply();

    setStaticHeaders(reply, path.join("/srv", "dist", "favicon.ico"));

    expect(header).not.toHaveBeenCalled();
  });

  it("verlangt einen echten /assets/-Pfadsegment-Treffer, nicht nur den Namen", () => {
    const { reply, header } = fakeReply();

    setStaticHeaders(reply, path.join("/srv", "dist", "assets-overview.html"));

    expect(header).not.toHaveBeenCalled();
  });
});
