/**
 * EarSaver - Content Script
 * Robust Web Audio API processing for YouTube
 */

(function () {
    if (window.EAR_SAVER_LOADED) {
        console.log('EarSaver: Already loaded, skipping...');
        return;
    }
    window.EAR_SAVER_LOADED = true;

    let audioCtx = null;
    let source = null;
    let preGainNode = null;
    let compressor = null;
    let gainNode = null;
    let currentVideo = null;
    let currentGainValue = 1.0;

    console.log('EarSaver: Content script initialized.');

    const setupPipeline = async (video) => {
        if (currentVideo === video) return;

        console.log('EarSaver: Setting up Adaptive Normalization...');

        try {
            if (audioCtx) await audioCtx.close();

            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            video.crossOrigin = "anonymous";

            source = audioCtx.createMediaElementSource(video);

            // 1. Pre-Gain: Boost quiet audio (+6dB approx 2x)
            preGainNode = audioCtx.createGain();
            preGainNode.gain.setValueAtTime(2.0, audioCtx.currentTime);

            // 2. Aggressive Compressor: Level out the boosted audio
            compressor = audioCtx.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-30, audioCtx.currentTime); // Lower threshold to catch more
            compressor.knee.setValueAtTime(20, audioCtx.currentTime);       // Slightly sharper knee
            compressor.ratio.setValueAtTime(20, audioCtx.currentTime);      // Limiter-like ratio
            compressor.attack.setValueAtTime(0.001, audioCtx.currentTime);  // Near-instant attack
            compressor.release.setValueAtTime(0.1, audioCtx.currentTime);   // Fast release

            // 3. Master Gain Node (User Controlled)
            gainNode = audioCtx.createGain();
            const result = await chrome.storage.local.get(['volume']);
            currentGainValue = result.volume !== undefined ? result.volume / 100 : 1.0;
            gainNode.gain.setValueAtTime(currentGainValue, audioCtx.currentTime);

            // Pipeline: Video -> PreGain -> Compressor -> MasterGain -> Destination
            source.connect(preGainNode);
            preGainNode.connect(compressor);
            compressor.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            currentVideo = video;
            console.log('EarSaver: Adaptive Pipeline active.');

            const resumeAudio = () => {
                if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
            };
            document.addEventListener('click', resumeAudio, { once: true });
            document.addEventListener('play', resumeAudio, { capture: true, once: true });

        } catch (err) {
            console.warn('EarSaver: Pipeline fallback:', err);
            currentVideo = video;
            if (video) video.volume = Math.min(1.0, currentGainValue);
        }
    };

    // Message listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SET_VOLUME') {
            currentGainValue = message.value;
            console.log('EarSaver: Gain set to', currentGainValue);

            if (gainNode && audioCtx && audioCtx.state !== 'closed') {
                try {
                    gainNode.gain.setTargetAtTime(currentGainValue, audioCtx.currentTime, 0.01);
                } catch (e) {
                    console.error('EarSaver: Gain node error', e);
                }
            } else if (currentVideo) {
                currentVideo.volume = Math.min(1.0, currentGainValue);
            }
            if (sendResponse) sendResponse({ success: true });
        }
        return true; // Keep message channel open for async if needed
    });

    // Check for video element
    const checkVideo = () => {
        const video = document.querySelector('video');
        if (video && video !== currentVideo) {
            setupPipeline(video);
        }
    };

    setInterval(checkVideo, 1000);
    checkVideo();
})();
