# Sync Obsidian to Feishu - User Guide

Automatically sync your Obsidian notes to Feishu Cloud Documents with cross-device access and collaboration.

## 📋 Features

- ✅ **One-Click Sync**: Click the cloud icon in the left sidebar to start syncing
- ✅ **Cross-Device Sync**: Sync authorization info via OneDrive, no re-authorization needed on other devices
- ✅ **Incremental Upload**: Only upload changed files to save time and bandwidth
- ✅ **Flexible Filtering**: Support exclude mode and whitelist mode for precise content control
- ✅ **Background Sync**: Non-blocking interface, use Obsidian normally while syncing
- ✅ **Real-time Progress**: Display sync progress, speed, and remaining time

## 🚀 Quick Start

### Step 1: Install Plugin

#### Manual Installation

1. Download the latest plugin files
2. Create plugin directory in your Obsidian vault:
   ```
   YourVault/.obsidian/plugins/sync-obsidian-feishu/
   ```
3. Copy these files to the plugin directory:
   - `main.js`
   - `manifest.json`
   - `styles.css`

### Step 2: Enable Plugin

1. Open Obsidian, go to **Settings → Community Plugins**
2. Turn off **Safe mode**
3. Find **"Sync Obsidian to Feishu"** in the installed plugins list
4. Toggle the switch to enable the plugin

## ⚙️ Configuration Guide

### Feishu App Configuration

#### 1. Create Feishu App

1. Visit [Feishu Open Platform](https://open.feishu.cn/)
2. Login and enter **Management Console**
3. Click **Create Enterprise Self-built App**
4. Fill in app information and create

#### 2. Configure App Permissions

Go to app details and add these permissions:
- **Files**: `drive:drive`, `drive:drive:readonly`
- **Documents**: `space:document:retrieve`

#### 3. Get App Credentials

Go to **Credentials & Basic Info**, copy:
- **App ID**: Format like `cli_xxxxxxxxx`
- **App Secret**: Click show and copy

#### 4. Create Sync Folder

Create a folder in Feishu Docs for your notes, copy the folder token from URL (`folder_xxxxxxxxx`)

### Plugin Settings

Open **Settings → Community Plugins → Sync Obsidian to Feishu**

#### Feishu App Configuration

- **App ID**: Paste your Feishu App ID
- **App Secret**: Paste your Feishu App Secret
- **Root Folder Token**: Paste your Feishu folder token
- **Redirect URI**: Keep default value
- Click **Test Connection** to verify configuration

#### Sync Strategy Configuration

**File Match Mode**:
- **Exclude Mode** (Recommended): Sync all files, exclude specified ones
- **Whitelist Mode**: Only sync specified files

**Sync Mode**:
- **Manual Sync**: Only sync when manually triggered
- **Auto Sync**: Sync when files change (Coming soon)
- **Scheduled Sync**: Sync at set time intervals

**File Size Limit**: Files larger than this will be skipped (Default: 20MB)

**File Match Rules**:
- Exclude mode example:
  ```
  .trash
  .obsidian/
  *.tmp
  ```
- Whitelist mode example:
  ```
  Documents/
  Projects/
  *.md
  ```

## 🔐 Authorization Flow

1. Open **Command Palette** (`Ctrl/Cmd + P`)
2. Type `Feishu`, find Feishu commands
3. Select **"Start Feishu authorization"**
4. Browser opens Feishu authorization page
5. Login and authorize the app
6. Authorization info is automatically saved

**Cross-Device Usage**: If your Obsidian vault is synced via OneDrive, no re-authorization needed on other devices.

## 📤 How to Use

### Start Syncing

Three ways to start sync:

1. **Click Sync Button**: Click the cloud icon ☁️ in the left sidebar
2. **Use Hotkey**: Configure hotkey in Settings
3. **Use Command Palette**: Select "Start sync" command

### Sync Status

Icon shows current status:
- ☁️ Idle
- 🔄 Syncing
- ✅ Success
- ❌ Failed
- ⚠️ Warning

## 🔧 Configuration Management

### Export Configuration

Click **Export Config** button, configuration downloads as JSON file.

### Import Configuration

Click **Import Config** button, select previously exported config file.

### Reset to Default

Click **Reset to Default** button to reset all settings.

## 🛠️ Troubleshooting

### Common Issues

**Authorization Failed**:
- Check Feishu app configuration
- Confirm Feishu app permissions are approved
- Check network connection

**Sync Failed**:
- Check network connection
- Verify Feishu folder token
- Check file size limit

**Files Skipped**:
- Check file match mode settings
- Confirm file size limit

## 📝 Best Practices

### Recommended Configuration

**Daily Use**:
- File match mode: Exclude mode
- File size limit: 20MB
- Concurrent uploads: 3

**High Performance**:
- File match mode: Whitelist mode
- File size limit: 50MB
- Concurrent uploads: 8

## 🔐 Security Notes

- Authorization info stored locally, synced via OneDrive
- Keep App Secret safe and secure
- Avoid syncing files with sensitive information
- Use in secure network environment

## 📞 Support

If you encounter issues:
1. Check troubleshooting section in this guide
2. View detailed logs in plugin settings
3. Search similar issues in GitHub Issues
4. Submit Issue on GitHub with detailed description

---

**Enjoy your Obsidian note syncing experience!** 🎉

For development or contribution, please refer to other documentation in the project root.