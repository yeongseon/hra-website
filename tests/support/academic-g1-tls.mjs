/** 브라우저의 실제 File/XHR 본문을 HTTPS 그대로 전달하기 위한 일회성 loopback 인증서다. */
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";

/** 외부 명령·파일·추가 의존성 없이 최소 X.509 DER를 만든다. 인증서는 테스트에서만 신뢰한다. */
export function academicGateTls() {
  const der = (tag, ...items) => {
    const body = Buffer.concat(items.map(item => Buffer.isBuffer(item) ? item : Buffer.from(item)));
    const length = body.length < 128 ? Buffer.from([body.length]) : (() => {
      let hex = body.length.toString(16); if (hex.length % 2) hex = `0${hex}`;
      const value = Buffer.from(hex, "hex"); return Buffer.concat([Buffer.from([128 + value.length]), value]);
    })();
    return Buffer.concat([Buffer.from([tag]), length, body]);
  };
  const sequence = (...items) => der(0x30, ...items);
  const algorithm = Buffer.from("300d06092a864886f70d01010b0500", "hex");
  const name = sequence(der(0x31, sequence(Buffer.from("0603550403", "hex"), der(0x0c, "G1 loopback QA only"))));
  // UTCTime은 초까지 포함한 YYMMDDHHMMSSZ 형식이다.
  const utc = value => der(0x17, value.toISOString().replace(/[-:T]/g, "").slice(2, 14) + "Z");
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const names = sequence(der(0x87, Buffer.from([127, 0, 0, 1])));
  const extension = der(0xa3, sequence(sequence(Buffer.from("0603551d11", "hex"), der(0x04, names))));
  const body = sequence(der(0xa0, der(0x02, [2])), der(0x02, Buffer.concat([Buffer.from([1]), randomBytes(15)])),
    algorithm, name, sequence(utc(new Date(Date.now() - 86_400_000)), utc(new Date(Date.now() + 86_400_000))),
    name, publicKey.export({ type: "spki", format: "der" }), extension);
  const certificate = sequence(body, algorithm, der(0x03, Buffer.concat([Buffer.from([0]), sign("sha256", body, privateKey)])));
  return { key: privateKey.export({ type: "pkcs8", format: "pem" }),
    cert: `-----BEGIN CERTIFICATE-----\n${certificate.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----\n` };
}
