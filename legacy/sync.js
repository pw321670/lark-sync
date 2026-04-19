const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "config.json");
const STATE_PATH = path.join(__dirname, "state.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function normalizeRelPath(p) {
  return p.replace(/\\/g, "/");
}

function shouldExclude(relPath, excludeList) {
  const normalized = normalizeRelPath(relPath);
  return excludeList.some((item) => normalized === item || normalized.startsWith(item + "/"));
}

function walkDir(rootDir, currentDir, excludeList, result = []) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absPath = path.join(currentDir, entry.name);
    const relPath = normalizeRelPath(path.relative(rootDir, absPath));

    if (shouldExclude(relPath, excludeList)) {
      continue;
    }

    if (entry.isDirectory()) {
      result.push({ type: "dir", absPath, relPath });
      walkDir(rootDir, absPath, excludeList, result);
    } else if (entry.isFile()) {
      result.push({ type: "file", absPath, relPath });
    }
  }

  return result;
}


async function refreshUserAccessToken(appId, appSecret, refreshToken) {
  const resp = await fetch(
    "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: appId,
        client_secret: appSecret,
        refresh_token: refreshToken,
      }),
    }
  );

  const data = await resp.json();
  if (data.code !== 0) {
    throw new Error(`刷新 user_access_token 失败: ${JSON.stringify(data)}`);
  }

  const accessToken =
    data?.data?.access_token ?? data?.access_token ?? "";
  const newRefreshToken =
    data?.data?.refresh_token ?? data?.refresh_token ?? refreshToken;

  if (!accessToken) {
    throw new Error(`刷新后未获取到 access_token: ${JSON.stringify(data)}`);
  }

  return {
    accessToken,
    refreshToken: newRefreshToken,
    raw: data,
  };
}



async function listFolderItems(userAccessToken, folderToken) {
  const url = new URL("https://open.feishu.cn/open-apis/drive/v1/files");
  url.searchParams.set("folder_token", folderToken);
  url.searchParams.set("page_size", "200");

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
    },
  });

  const data = await resp.json();
  if (data.code !== 0) {
    throw new Error(`读取文件夹失败: ${JSON.stringify(data)}`);
  }

  return (data.data?.files || []).map((item) => ({
    type: item.type || "",
    name: item.name || "",
    token: item.token || "",
    raw: item
  }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createFolder(userAccessToken, parentFolderToken, folderName) {
  console.log(`准备创建文件夹: ${folderName} | 父目录 token: ${parentFolderToken}`);

  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(
        "https://open.feishu.cn/open-apis/drive/v1/files/create_folder",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userAccessToken}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            name: folderName,
            folder_token: parentFolderToken
          }),
        }
      );

      const text = await resp.text();
      console.log(`创建文件夹原始返回(第${attempt}次): ${text}`);

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`创建文件夹返回了非 JSON 内容: ${text}`);
      }

      if (data.code === 0) {
        return data.data?.token;
      }

      lastError = new Error(`创建文件夹失败 [${folderName}] 第${attempt}次: ${JSON.stringify(data)}`);
      console.log(lastError.message);

      await sleep(1000 * attempt);
    } catch (err) {
      lastError = err;
      console.log(`创建文件夹异常 [${folderName}] 第${attempt}次: ${err.message}`);
      await sleep(1000 * attempt);
    }
  }

  throw lastError || new Error(`创建文件夹失败 [${folderName}]`);
}

async function ensureFolder(userAccessToken, parentFolderToken, folderName) {
  const items = await listFolderItems(userAccessToken, parentFolderToken);

  const existing = items.find((item) => {
    return item.type === "folder" && item.name === folderName;
  });

  if (existing && existing.token) {
    console.log(`命中已有目录: ${folderName} -> ${existing.token}`);
    return existing.token;
  }

  console.log(`未命中已有目录，准备新建: ${folderName}`);
  return await createFolder(userAccessToken, parentFolderToken, folderName);
}

async function uploadSmallFile(userAccessToken, parentFolderToken, filePath) {
  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);

  const form = new FormData();
  form.append("file_name", fileName);
  form.append("parent_type", "explorer");
  form.append("parent_node", parentFolderToken);
  form.append("size", String(stat.size));
  form.append("file", new Blob([fs.readFileSync(filePath)]), fileName);

  const resp = await fetch(
    "https://open.feishu.cn/open-apis/drive/v1/files/upload_all",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
      body: form,
    }
  );

  const data = await resp.json();
  if (data.code !== 0) {
    throw new Error(`上传文件失败: ${JSON.stringify(data)}`);
  }

  return data.data;
}

async function findExistingFilesInFolder(userAccessToken, folderToken, fileName) {
  const items = await listFolderItems(userAccessToken, folderToken);

  const matched = items.filter((item) => {
    return item.name === fileName && item.type === "file";
  });

  console.log(`目录 ${folderToken} 下匹配到 ${matched.length} 个同名文件: ${fileName}`);
  for (const item of matched) {
    console.log(`- name=${item.name}, type=${item.type}, token=${item.token}`);
  }

  return matched;
}

async function deleteFileByToken(userAccessToken, fileToken, fileType = "file") {
  console.log(`准备删除旧文件 token: ${fileToken}, type: ${fileType}`);

  const url = new URL(`https://open.feishu.cn/open-apis/drive/v1/files/${fileToken}`);
  url.searchParams.set("type", fileType);

  const resp = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
    },
  });

  const data = await resp.json();
  if (data.code !== 0) {
    throw new Error(`删除旧文件失败: ${JSON.stringify(data)}`);
  }

  console.log(`已删除旧文件 token: ${fileToken}`);
}

async function main() {
  const config = readJson(CONFIG_PATH);
  const state = fs.existsSync(STATE_PATH) ? readJson(STATE_PATH) : {};

  if (!config.refreshToken) {
    throw new Error("config.json 中没有 refreshToken，请先运行 node auth.js 完成授权。");
  }

  console.log("0) 刷新 user_access_token...");
  const refreshed = await refreshUserAccessToken(
    config.appId,
    config.appSecret,
    config.refreshToken
  );

  config.userAccessToken = refreshed.accessToken;
  config.refreshToken = refreshed.refreshToken;
  saveJson(CONFIG_PATH, config);

  console.log("token 刷新成功");

  const allEntries = walkDir(config.vaultPath, config.vaultPath, config.exclude || []);
  const dirs = allEntries.filter((x) => x.type === "dir").sort((a, b) => a.relPath.localeCompare(b.relPath));
  const files = allEntries.filter((x) => x.type === "file").sort((a, b) => a.relPath.localeCompare(b.relPath));

  const folderMap = {
    "": config.feishuRootFolderToken,
  };

  console.log(`发现 ${dirs.length} 个文件夹，${files.length} 个文件`);

  console.log("1) 创建/确认飞书目录结构...");
  for (const dir of dirs) {
    const parentRel = normalizeRelPath(path.dirname(dir.relPath));
    const parentKey = parentRel === "." ? "" : parentRel;
    const parentToken = folderMap[parentKey];

    if (!parentToken) {
      throw new Error(`找不到父目录 token: ${dir.relPath}`);
    }

    const folderName = path.basename(dir.relPath);
    console.log(`正在处理目录: ${dir.relPath}`);
    const token = await ensureFolder(config.userAccessToken, parentToken, folderName);
    folderMap[dir.relPath] = token;

    console.log(`目录 OK: ${dir.relPath}`);
    await sleep(500);
  }

  console.log("2) 增量上传文件...");
  let uploadedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const stat = fs.statSync(file.absPath);
    const relPath = file.relPath;
    const parentRel = normalizeRelPath(path.dirname(relPath));
    const parentKey = parentRel === "." ? "" : parentRel;
    const parentToken = folderMap[parentKey];

    if (!parentToken) {
      throw new Error(`找不到文件父目录 token: ${relPath}`);
    }

    const prev = state[relPath];
    const unchanged =
      prev &&
      prev.size === stat.size &&
      prev.mtimeMs === stat.mtimeMs;

    if (unchanged) {
      skippedCount++;
      console.log(`跳过: ${relPath}`);
      continue;
    }

    const sizeMB = stat.size / 1024 / 1024;
if (sizeMB > config.maxDirectUploadMB) {
  console.log(`跳过大文件(待后续分片): ${relPath}`);
  continue;
}

const existingFiles = await findExistingFilesInFolder(
  config.userAccessToken,
  parentToken,
  path.basename(file.absPath)
);

if (existingFiles.length > 0) {
  console.log(`发现 ${existingFiles.length} 个同名旧文件，准备全部删除: ${relPath}`);
  for (const oldFile of existingFiles) {
    if (oldFile.token) {
      await deleteFileByToken(
        config.userAccessToken,
        oldFile.token,
        oldFile.type || "file"
      );
    }
  }
}

await uploadSmallFile(config.userAccessToken, parentToken, file.absPath);

state[relPath] = {
  size: stat.size,
  mtimeMs: stat.mtimeMs,
  uploadedAt: new Date().toISOString(),
};

uploadedCount++;
console.log(`已上传: ${relPath}`);
  }

  saveJson(STATE_PATH, state);

  console.log("同步完成");
  console.log(`上传 ${uploadedCount} 个，跳过 ${skippedCount} 个`);
}

main().catch((err) => {
  console.error("运行失败：", err.message);
  process.exit(1);
});