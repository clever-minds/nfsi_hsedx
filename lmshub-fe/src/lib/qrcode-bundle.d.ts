declare module '@/lib/qrcode-bundle.js' {
  export interface QRCodeToDataURLOptions {
    margin?: number;
    width?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    color?: {
      dark?: string;
      light?: string;
    };
  }

  const QRCode: {
    toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
    toString(text: string, options?: Record<string, unknown>): Promise<string>;
  };

  export default QRCode;
}

