import axios from 'axios';
import FormData from 'form-data';
import https from 'https';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

export const uploadToStreamtape = async (buffer, filename) => {
  // Step 1: Get upload URL with httponly=1
  const { data: init } = await axios.get(`https://api.streamtape.com/file/ul`, {
    params: {
      login: process.env.STREAMTAPE_LOGIN,
      key: process.env.STREAMTAPE_KEY,
    },
  });

  if (!init?.result?.url) throw new Error('Failed to get Streamtape upload URL');

  const uploadUrl = init.result.url;

  // Step 2: Upload file to Streamtape
  const form = new FormData();
  form.append('file1', buffer, filename);

  const agent = new https.Agent({ keepAlive: true, family: 4 });

  const uploadRes = await axios.post(uploadUrl, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    httpsAgent: agent,
  });

  const { result } = uploadRes.data;

  if (!result?.id) throw new Error('Upload failed or ID missing');

  const fileId = result.id;

  return {
    fileId,
    streamUrl: `https://streamtape.com/e/${fileId}`,
    downloadUrl: `https://streamtape.com/get_video?id=${fileId}`,
  };
};
