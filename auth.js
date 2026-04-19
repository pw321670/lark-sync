const fs = require("fs");
const path = require("path");
const http = require("http");
const { exec } = require("child_process");

const CONFIG_PATH = path.join(__dirname, "config.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function openBrowser(url) {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd);
}

async function getUserAccessToken(clientId, clientSecret, code, redirectUri) {
  const resp = await fetch(
    "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      })
    }
  );

  const data = await resp.json();
  if (data.code !== 0) {
    throw new Error(`获取 user_access_token 失败: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const config = readJson(CONFIG_PATH);
  const redirectUrl = new URL(config.redirectUri);
  const port = Number(redirectUrl.port || 3333);

const scopes = [
  "offline_access",
  "drive:drive",
  "drive:drive:readonly",
  "space:document:retrieve"
].join(" ");

const authUrl =
  "https://accounts.feishu.cn/open-apis/authen/v1/authorize" +
  `?client_id=${encodeURIComponent(config.appId)}` +
  `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(scopes)}`;

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, config.redirectUri);
    if (reqUrl.pathname !== redirectUrl.pathname) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const code = reqUrl.searchParams.get("code");
    if (!code) {
      res.writeHead(400);
      res.end("No code found");
      return;
    }

    try {
      const tokenData = await getUserAccessToken(
        config.appId,
        config.appSecret,
        code,
        config.redirectUri
      );

console.log("tokenData =", JSON.stringify(tokenData, null, 2));

const accessToken =
  tokenData?.data?.access_token ?? tokenData?.access_token ?? "";
const refreshToken =
  tokenData?.data?.refresh_token ?? tokenData?.refresh_token ?? "";

if (!accessToken) {
  throw new Error(`未获取到 access_token，返回内容：${JSON.stringify(tokenData)}`);
}

config.userAccessToken = accessToken;
config.refreshToken = refreshToken;
saveJson(CONFIG_PATH, config);
      saveJson(CONFIG_PATH, config);

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h2>授权成功，可以回到终端继续了。</h2>");

      console.log("user_access_token 获取成功");
      console.log("refresh_token 已写入 config.json");
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<pre>${err.message}</pre>`);
      console.error(err.message);
    } finally {
      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 1000);
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log("请在浏览器中完成授权...");
    console.log(authUrl);
    openBrowser(authUrl);
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});