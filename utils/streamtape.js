import axios from "axios";
import FormData from "form-data";
import https from "https";
import dns from "dns";

dns.setDefaultResultOrder("ipv4first");

export const uploadToStreamtape = async (buffer, filename) => {
  try {
    // 1️⃣ Get upload URL with `httponly` = 1
    const { data: initRes } = await axios.get(
      "https://api.streamtape.com/file/ul",
      {
        params: {
          login: process.env.STREAMTAPE_LOGIN,
          key: process.env.STREAMTAPE_KEY,
          httponly: 0,
        },
      }
    );

    if (initRes?.msg !== "OK" || !initRes?.result?.url) {
      throw new Error("Failed to get upload URL from Streamtape.");
    }
    const uploadUrl = initRes.result.url;

    // 2️⃣ Prepare form with video file
    const form = new FormData();
    form.append("file1", buffer, filename);

    // 3️⃣ Perform upload
    const agent = new https.Agent({ keepAlive: true, family: 4 });

    const { data: uploadRes } = await axios.post(uploadUrl, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      httpsAgent: agent,
    });

    if (uploadRes?.msg !== "OK" || !uploadRes?.result?.id) {
      throw new Error("Upload failed or no file ID returned.");
    }
    const result = uploadRes.result;

    return {
      fileId: result.id,
      fileName: result.name,
      streamUrl: `https://streamtape.com/e/${result.id}`,
      downloadUrl: result.url,
      size: result.size,
      contentType: result.content_type,
      sha256: result.sha256,
    };
  } catch (error) {
    console.error("Upload error:", error?.message);
    throw error;
  }
};
