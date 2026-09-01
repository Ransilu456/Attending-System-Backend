import QRCode from 'qrcode';

// Generate a base64 Data URL for a given QR string payload
export const generateQRCode = async (data) => {
  try {
    const qrCode = await QRCode.toDataURL(String(data), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 400,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrCode;
  } catch (error) {
    throw new Error(`Failed to generate QR code: ${error.message}`);
  }
};

export default generateQRCode;
