import { describe, expect, it } from 'vitest';

import { createQrCodeSvgV1 } from './qr-svg';

const goldens: readonly (readonly [number, number, string])[] = [
  [1, 1, '6d731b564a4d758fafb2641cbb4a7c15f4e60067942b1965734206072c731394'],
  [2, 18, '32f640bdd5524646d4c6e6389dce00c62cdf1c0cd92c5d59e6180653c792502f'],
  [3, 33, '0e86e60dd9f49cb8a5d75fe62fed510e3d56c45061b31a1f0d675a18d2e09f66'],
  [4, 54, '2f4e4af8ef6dff69cd579b9241919969480fbc7ec1dc62e98d63142f1d69bdcb'],
  [5, 79, '4975828e609516485e88b5d61a59279754cd39a06a848ded11d2aea5566cc337'],
  [6, 107, 'd5a51745207d073ba8d2bb5e0c68462968d62a69a097ec35d13f606b10e5b8fb'],
  [7, 135, '8b5f6b328ccb7b486c4525980c7dec164894c2eb9fbdb15d9573db5c3f7ed7db'],
  [8, 155, '502d8e3db5cdfd5097d51424272003c253d4d3f0d0249f73f7e7a607f0e8bedd'],
  [9, 193, '8ecd3a4c5b5b497befce6aa638a30dc5e26066212227995c43d1a45ea0938851'],
  [10, 231, '08c91d207b2b4ebdc60d67327e3bab65285d03c445fbb0589e575f441c40a16b'],
  [11, 272, '35d6b14acc80edec5273f370af15ceec6bc2b32f3a73db844074b673c2db54a5'],
  [12, 322, '0cc2032bebec7002ffcaa6d596a53d57c136bb6239d172e32d27b4717b168111'],
  [13, 368, 'e36aa17c5e5a08472bb61c83e7185a5c6ae24fdeb3dfacdf14d00b28d917c451'],
  [14, 426, '3b0d6190b2f30018f7efa44cc40da7753672232e831468959f41a250eacebaea'],
  [15, 459, 'c1b4365b565af2bfeea978885b707589c46f628d217a01fa9b10e1c2158651be'],
  [16, 521, '822ef2a78e756c63160ced7da034d2c5754017d8b96e27a47df763503473a8bb'],
  [17, 587, 'ca3092282a7d14a6d986809dfdbd79b174cffd6efea42223664335e63a60d4b8'],
  [18, 645, '45a69602b2d5f2866fb34d21c84e4c229963d9917393ea6885c831e6692d57dd'],
  [19, 719, 'bab3231ac19d16c3271bbc6e689ac96e73241314724df93fd3cd01ef238a443d'],
  [20, 793, '156610066b110c0670531b415d1c8fec7ac9756e6979215677eaf6922626045b'],
  [21, 859, '8c8c06e7a3360b57f51a7165583b1247423523949d8f337ff600530e06e191e3'],
  [22, 930, 'a940e15f952776579b1242e2fa3deff299df67045e7fefdbfb6b9adb063279d8'],
  [23, 1004, '421a3640f0efabdbcccc1035ad8c801f924a64275f36eeb58fd20cf26423e1cd'],
  [24, 1092, 'b4b5847df32f80d07974cd024f8179807fe13fbc5260974bdee109e0da0d2c95'],
  [25, 1172, 'c36b443ae75515c7aa8788591990dcdc667d4591305d83c8d413733ae0998b57'],
  [26, 1274, 'b896c9a0b55b955d8ba0af3ccd3bcc38e8eba6f3c6dfd32dead2531647ae3554'],
  [27, 1368, '9dadcb59194ba3233b891ac39e055451efd1193d89a455aaf090d2c932b01434'],
  [28, 1466, 'cb8a0e1ed1caa3348838a09c7860770d8c097a32e354312c35dc1f35154198ef'],
  [29, 1529, '958d31c92cc6b03b5fee896082a383b6bfc2547c8178db8d179cd8bd5ca6b6e3'],
  [30, 1629, 'bdb2af797f43f8cf2c04125b804b161a756044695a4421fc42303b1e8d48a07a'],
  [31, 1733, '7f1bb04ddbe0bc7073806debc506139008806a65896dd8987e66e61bbd6c9948'],
  [32, 1841, '762400cd2f936f3a77919d782a53c93dfbb9df35dd5a16c470a48d6c45426e7d'],
  [33, 1953, '77769e5aa45205771f0ddb162c133b3d34d72f65bb22e717ec6c70631ab8574e'],
  [34, 2069, '94a635dd321a1d991d558a323ebbb58077460991c2b4573916ee25b3dae9e4c1'],
  [35, 2189, 'c15655c608c2007c873551adc460d552f2937a5d3dfe12e7b2aee21471ff1b00'],
  [36, 2304, '9eaf9c00e5ef6118195ba60615b08813cb101fed4130e1349aaeed8ac75f5b5f'],
  [37, 2432, '0968e8277ea78f76e175363da7945fe57b36e9227fd3c55f2d2fd833d4b51d8f'],
  [38, 2564, '26460a84841e0a3d018ef1cf4aefe999ae2fb0d3ef49753a9f0c3ce40614c0c2'],
  [39, 2700, '4cd542cabf1dcc1ab8c4d6b30bbebebdd1fe33b76e09233c0e5778637a428d23'],
  [40, 2810, '53a9436805b1dc4e1f1c2c2f63a08e6b60cd58c8eba971005c9b23ee42d64fc6'],
];

async function fingerprint(svg: SVGSVGElement): Promise<string> {
  const modules = svg.querySelector<SVGPathElement>('[data-qr-modules]');
  const size = Number(modules?.dataset['qrModules']);
  const dark = new Set(
    Array.from(
      (modules?.getAttribute('d') ?? '').matchAll(/M(\d+) (\d+)h1v1h-1z/gu),
      (match) => `${match[1] ?? ''},${match[2] ?? ''}`,
    ),
  );
  const bits = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => (dark.has(`${String(x)},${String(y)}`) ? '1' : '0')).join(''),
  ).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bits));

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('QR versions 1 through 40', () => {
  it.each(goldens)('matches the independent version-%i byte-mode/mask-0 golden', async (version, length, hash) => {
    const svg = createQrCodeSvgV1({ document, value: 'x'.repeat(length), errorCorrection: 'L', quietZoneCssPixels: 0 });

    expect(svg?.dataset['qrVersion']).toBe(String(version));
    expect(svg === undefined ? undefined : await fingerprint(svg)).toBe(hash);
  });

  it('returns no symbol for empty content', () => {
    expect(createQrCodeSvgV1({ document, value: '', errorCorrection: 'L', quietZoneCssPixels: 0 })).toBeUndefined();
  });
});
