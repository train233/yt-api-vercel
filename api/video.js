// api/video.js - Vercel Serverless Function (PoToken内蔵)
import { generate } from 'youtube-po-token-generator';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================
// 設定
// ============================================
const CACHE_DURATION = 3600000; // 1時間
let cachedPoToken = null;
let cacheTime = 0;

// ============================================
// PoToken取得（キャッシュ付き）
// ============================================
async function getPoToken() {
  const now = Date.now();
  if (cachedPoToken && (now - cacheTime) < CACHE_DURATION) {
    console.log('✅ Using cached PoToken');
    return cachedPoToken;
  }

  try {
    console.log('🔄 Generating new PoToken...');
    const result = await generate();
    cachedPoToken = result.poToken;
    cacheTime = now;
    console.log('✅ PoToken generated');
    return cachedPoToken;
  } catch (error) {
    console.error('❌ PoToken generation failed:', error.message);
    return null;
  }
}

// ============================================
// メインハンドラー
// ============================================
export default async function handler(req, res) {
  // CORSヘッダーを設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONSリクエスト（プリフライト）は即時応答
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GETリクエストのみ許可
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing video id' });
  }

  try {
    // 1. PoTokenを取得
    const poToken = await getPoToken();
    if (!poToken) {
      return res.status(500).json({ error: 'Failed to get PoToken' });
    }

    // 2. yt-dlpで動画情報を取得
    const command = `yt-dlp -j --extractor-args "youtube:po_token=web.player+${poToken}" https://www.youtube.com/watch?v=${id}`;
    console.log('🔍 Running yt-dlp...');

    const { stdout, stderr } = await execAsync(command);
    if (stderr) {
      console.warn('⚠️ yt-dlp stderr:', stderr);
    }

    const data = JSON.parse(stdout);

    // 3. レスポンス
    res.json({
      videoId: data.id || id,
      title: data.title || 'タイトルなし',
      author: data.uploader || '不明',
      authorId: data.channel_id || '',
      thumbnail: data.thumbnail || '',
      viewCount: data.view_count || 0,
      duration: data.duration || 0,
      description: data.description || '',
      streamUrl: data.url || null,
      isLive: data.is_live || false,
      isFrom: 'vercel-yt-api',
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}