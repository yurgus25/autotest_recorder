/**
 * Offscreen video recorder: captures tab via streamId, records with MediaRecorder, saves WebM to Downloads.
 * Listens for START_RECORDING { streamId } and STOP_RECORDING { testId, testName, makeSeekable }.
 * When makeSeekable is true, post-processes blob with EBML to add Cues (перемотка).
 */
(function () {
  const DEFAULT_BASE_PATH = 'AutoTestRecorder/videos/';
  let mediaRecorder = null;
  let stream = null;
  let chunks = [];

  /**
   * Делает WebM blob перематываемым (добавляет Cues). Требует загруженный EBML (libs/ebml.min.js).
   * @param {Blob} blob - исходный WebM
   * @param {string} mimeType
   * @returns {Promise<Blob>} - тот же blob или постобработанный seekable blob
   */
  function makeBlobSeekable(blob, mimeType) {
    const EBML = (typeof window !== 'undefined' && window.EBML) || (typeof globalThis !== 'undefined' && globalThis.EBML);
    if (!EBML || !EBML.Decoder || !EBML.Reader || !EBML.tools || !EBML.tools.makeMetadataSeekable) {
      console.warn('[VideoRecorder] makeBlobSeekable: EBML не загружен, сохраняю без постобработки');
      return Promise.resolve(blob);
    }
    console.log('[VideoRecorder] makeBlobSeekable: постобработка для перемотки...');
    return blob.arrayBuffer().then(function (buffer) {
      const decoder = new EBML.Decoder();
      const reader = new EBML.Reader();
      reader.logging = false;
      reader.drop_default_duration = false;
      const elms = decoder.decode(buffer);
      elms.forEach(function (elm) { reader.read(elm); });
      reader.stop();
      let duration = reader.duration;
      if (!Number.isFinite(duration) || duration < 0) {
        duration = 0;
      }
      const cues = reader.cues && reader.cues.length ? reader.cues : [];
      if (cues.length === 0) {
        console.warn('[VideoRecorder] makeBlobSeekable: нет cue-точек (часто бывает у MediaRecorder), в файл будет записана только длительность');
      }
      const refinedMetadataBuf = EBML.tools.makeMetadataSeekable(reader.metadatas, duration, cues);
      const body = buffer.slice(reader.metadataSize);
      console.log('[VideoRecorder] makeBlobSeekable: готово, перемотка включена');
      return new Blob([refinedMetadataBuf, body], { type: mimeType });
    }).catch(function (err) {
      console.warn('[VideoRecorder] makeBlobSeekable failed:', err && err.message ? err.message : err);
      return blob;
    });
  }

  function sanitizeFileName(name) {
    if (name == null || name === '') return 'test';
    return String(name)
      .replace(/[/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 100) || 'test';
  }

  function formatTimestamp() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${day}_${h}-${min}-${s}`;
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  function resetState() {
    chunks = [];
    mediaRecorder = null;
    stopStream();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_RECORDING') {
      const streamId = message.streamId;
      if (!streamId) {
        console.warn('[VideoRecorder] START_RECORDING: no streamId');
        sendResponse({ success: false, error: 'No streamId' });
        return true;
      }
      resetState();
      const constraints = {
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        }
      };
      navigator.mediaDevices
        .getUserMedia(constraints)
        .then((mediaStream) => {
          stream = mediaStream;
          const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
            ? 'video/webm;codecs=vp8'
            : 'video/webm';
          mediaRecorder = new MediaRecorder(stream, { mimeType });
          chunks = [];
          mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };
          mediaRecorder.onstop = () => {
            stopStream();
          };
          mediaRecorder.onerror = (e) => {
            console.error('[VideoRecorder] MediaRecorder error:', e);
            stopStream();
          };
          mediaRecorder.start(1000);
          sendResponse({ success: true });
        })
        .catch((err) => {
          console.error('[VideoRecorder] getUserMedia failed:', err);
          resetState();
          sendResponse({ success: false, error: err.message || String(err) });
        });
      return true;
    }

    if (message.type === 'STOP_RECORDING') {
      const testId = message.testId;
      const testName = message.testName;
      const makeSeekable = message.makeSeekable === true;
      const basePath = (message.savePath || DEFAULT_BASE_PATH).replace(/\\/g, '/').replace(/\/+$/, '') + '/';
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resetState();
        sendResponse({ success: false, error: 'No active recording' });
        return true;
      }
      const mimeTypeToUse = mediaRecorder.mimeType;
      mediaRecorder.onstop = () => {
        // Последний фрагмент может прийти в ondataavailable после stop(); даём время на его приход
        setTimeout(() => {
          let blob = new Blob(chunks, { type: mimeTypeToUse });
          chunks = [];
          stopStream();
          mediaRecorder = null;
          const name = sanitizeFileName(testName || testId || 'test');
          const filename = `${basePath}${name}_${formatTimestamp()}.webm`;

          function sendBlob(finalBlob) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result.split(',')[1] || '';
              chrome.runtime.sendMessage(
                { type: 'SAVE_VIDEO_FILE', filename, base64Data: base64, mimeType: mimeTypeToUse },
                () => {
                  // Сразу освобождаем состояние в offscreen; background закроет документ после сохранения
                  resetState();
                  if (typeof sendResponse === 'function') sendResponse({ success: true, filename });
                }
              );
            };
            reader.onerror = () => {
              console.error('[VideoRecorder] FileReader failed');
              resetState();
              if (typeof sendResponse === 'function') sendResponse({ success: false, error: 'FileReader failed' });
            };
            reader.readAsDataURL(finalBlob);
          }

          if (makeSeekable) {
            makeBlobSeekable(blob, mimeTypeToUse).then(sendBlob);
          } else {
            sendBlob(blob);
          }
        }, 150);
      };
      try {
        if (mediaRecorder.state === 'recording' && typeof mediaRecorder.requestData === 'function') {
          mediaRecorder.requestData();
        }
        mediaRecorder.stop();
      } catch (e) {
        console.error('[VideoRecorder] stop failed:', e);
        resetState();
        sendResponse({ success: false, error: e.message || String(e) });
      }
      return true;
    }
    return false;
  });
})();
