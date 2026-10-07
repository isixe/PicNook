import { detect, embed, type DetectResult, type LogoData, type RgbaImage } from '@/lib/watermark';

interface EmbedRequest {
  id: number;
  op: 'embed';
  image: RgbaImage;
  password: string;
  strength: number;
  text: string;
  logo?: LogoData;
}

interface DetectRequest {
  id: number;
  op: 'detect';
  image: RgbaImage;
  password: string;
}

type WorkerRequest = EmbedRequest | DetectRequest;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.op === 'embed') {
      const image = embed(request.image, {
        password: request.password,
        strength: request.strength,
        text: request.text,
        logo: request.logo,
      });
      self.postMessage({ id: request.id, ok: true, image });
      return;
    }
    const result: DetectResult = detect(request.image, { password: request.password });
    self.postMessage({ id: request.id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
