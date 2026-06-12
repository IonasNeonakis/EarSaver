(function () {
    if (window.EAR_SAVER_LOADED) return;
    window.EAR_SAVER_LOADED = true;

    let audioCtx = null;
    let sourceMap = new WeakMap(); // Cache sources for video elements
    let preGainNode = null;
    let compressor = null;
    let gainNode = null;
    let currentVideo = null;
    let currentGainValue = 1.0;

    console.log('EarSaver: Content script active.');

    const initAudioContext = () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();

            preGainNode = audioCtx.createGain();
            preGainNode.gain.value = 2.0;

            compressor = audioCtx.createDynamicsCompressor();
            compressor.threshold.value = -30;
            compressor.knee.value = 20;
            compressor.ratio.value = 20;
            compressor.attack.value = 0.001;
            compressor.release.value = 0.1;

            gainNode = audioCtx.createGain();
            chrome.storage.local.get(['volume'], (result) => {
                currentGainValue = result.volume !== undefined ? result.volume / 100 : 1.0;
                if (gainNode) gainNode.gain.value = currentGainValue;
            });

            // Pre-connect the static part of the chain
            preGainNode.connect(compressor);
            compressor.connect(gainNode);
            gainNode.connect(audioCtx.destination);
        }
        return audioCtx;
    };

    const setupPipeline = async (video) => {
        if (!video || currentVideo === video) return;
        currentVideo = video; // Set immediately to prevent re-entrancy

        console.log('EarSaver: Connecting audio pipeline...');

        try {
            const ctx = initAudioContext();

            // Only set crossOrigin if not already set, to avoid triggering reloads
            if (video.crossOrigin !== "anonymous") {
                video.crossOrigin = "anonymous";
            }

            let source = sourceMap.get(video);
            if (!source) {
                source = ctx.createMediaElementSource(video);
                sourceMap.set(video, source);
            }

            // Connect source to the beginning of our pre-configured chain
            source.disconnect(); // Clear existing connections
            source.connect(preGainNode);

            if (ctx.state === 'suspended') {
                const resume = () => ctx.resume();
                document.addEventListener('click', resume, { once: true });
                video.addEventListener('play', resume, { once: true });
            }

        } catch (err) {
            console.error('EarSaver: Pipeline error:', err);
            // Fallback to standard volume if Web Audio fails
            if (video) video.volume = Math.min(1.0, currentGainValue);
        }
    };

    // Use YouTube's specific navigation event for better performance
    document.addEventListener('yt-navigate-finish', () => {
        const video = document.querySelector('video');
        if (video) setupPipeline(video);
    });

    // Fallback/Initial check
    const observer = new MutationObserver(() => {
        const video = document.querySelector('video');
        if (video && video !== currentVideo) {
            setupPipeline(video);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Handle volume updates from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SET_VOLUME') {
            currentGainValue = message.value;
            if (gainNode && audioCtx && audioCtx.state !== 'closed') {
                gainNode.gain.setTargetAtTime(currentGainValue, audioCtx.currentTime, 0.01);
            } else if (currentVideo) {
                currentVideo.volume = Math.min(1.0, currentGainValue);
            }
            sendResponse({ success: true });
        }
        return true;
    });

    // Initial run
    const initialVideo = document.querySelector('video');
    if (initialVideo) setupPipeline(initialVideo);
})();
