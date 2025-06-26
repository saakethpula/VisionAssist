import React, { useRef, useState } from "react";

// Add these types at the top of the file for TypeScript compatibility
// @ts-ignore
interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
}

const Vision: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [photo, setPhoto] = useState<string | null>(null);
    const [streaming, setStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detection, setDetection] = useState<string | null>(null);
    const [listening, setListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [autoDetecting, setAutoDetecting] = useState(false);
    const [autoDetectInterval, setAutoDetectInterval] = useState<number | null>(null);
    const [debugDescription, setDebugDescription] = useState<string | null>(null);
    let recognition: any = null;

    const startCamera = async () => {
        setError(null);
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    setStreaming(true);
                }
            } catch (err) {
                setError("Could not access the camera.");
            }
        } else {
            setError("Camera not supported in this browser.");
        }
    };

    const takePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const width = videoRef.current.videoWidth;
            const height = videoRef.current.videoHeight;
            canvasRef.current.width = width;
            canvasRef.current.height = height;
            const ctx = canvasRef.current.getContext("2d");
            if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0, width, height);
                const dataUrl = canvasRef.current.toDataURL("image/png");
                setPhoto(dataUrl);
            }
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
            setStreaming(false);
        }
    };

    // Microphone setup
    const startListening = () => {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            setError("Speech recognition not supported in this browser.");
            return;
        }
        setError(null);
        setTranscript("");
        setListening(true);
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.onresult = (event: any) => {
            setTranscript(event.results[0][0].transcript);
            setListening(false);
        };
        recognition.onerror = () => {
            setError("Microphone error or permission denied.");
            setListening(false);
        };
        recognition.onend = () => setListening(false);
        recognition.start();
    };

    const stopListening = () => {
        if (recognition) {
            recognition.stop();
        }
        setListening(false);
    };

    // Helper to get full frame as base64
    const getFullFrameBase64 = (): string | null => {
        if (videoRef.current && canvasRef.current) {
            const width = videoRef.current.videoWidth;
            const height = videoRef.current.videoHeight;
            canvasRef.current.width = width;
            canvasRef.current.height = height;
            const ctx = canvasRef.current.getContext("2d");
            if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0, width, height);
                const dataUrl = canvasRef.current.toDataURL("image/png");
                return dataUrl.replace(/^data:image\/png;base64,/, "");
            }
        }
        return null;
    };

    const analyzeCenter = async (): Promise<string> => {
        if (videoRef.current && canvasRef.current) {
            // Wait until video is ready
            if (
                videoRef.current.readyState < 2 ||
                videoRef.current.videoWidth === 0 ||
                videoRef.current.videoHeight === 0
            ) {
                // Not ready, try again in 300ms
                await new Promise(res => setTimeout(res, 300));
                return analyzeCenter();
            }
            const width = videoRef.current.videoWidth;
            const height = videoRef.current.videoHeight;
            // --- Capture full frame as base64 ---
            canvasRef.current.width = width;
            canvasRef.current.height = height;
            const ctx = canvasRef.current.getContext("2d");
            let fullFrameBase64 = "";
            if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0, width, height);
                const fullFrameDataUrl = canvasRef.current.toDataURL("image/png");
                fullFrameBase64 = fullFrameDataUrl.replace(/^data:image\/png;base64,/, "");
            }
            // --- Updated prompt for wider net and more specific matching ---
            let prompt = `USER DESCRIPTION: "${transcript}"

You are a vision assistant. Your job is to help the user frame the object or person they described above in the camera view so that a photo can be taken. Look for anything that could plausibly match the user's description, even if it is not a perfect match. Err on the side of inclusion: if there is any object that could reasonably be what the user described, use that. Do NOT default to people unless the user described a person. Do NOT try to identify who or what it is beyond the user's description. Do NOT comment on identity. Only give spatial directions for framing the described object or person in the view.

Instructions:
- If the described object or person (or the best plausible match) is fully within the central fifth (the middle 20% horizontally and vertically) of the camera frame, reply ONLY with 'ready'.
- If it is not fully within the central fifth, reply ONLY with precise directions (left, right, up, down, closer, farther) to move the described object or person into the central fifth.
- If the described object or person is not visible, reply ONLY with 'not visible'.
- Do not guess. Do not comment on identity. Do not add extra text.
`;
            prompt += "\nBe practical. Cast a wide net. Reply with only the directions or say 'ready' if the described object or person (or best plausible match) is fully within the middle fifth of the frame.";
            const response = await fetch("http://localhost:5174/api/openai-proxy", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt,
                    imageBase64: fullFrameBase64
                })
            });
            const result = await response.json();
            const text = result.text?.toLowerCase() || "";
            setDetection(text);
            setDebugDescription(result.debugDescription || null);
            // --- New logic: If model sees the object but says 'not visible', show a warning ---
            if (
                text === 'not visible' &&
                result.debugDescription &&
                transcript &&
                result.debugDescription.toLowerCase().includes(transcript.toLowerCase())
            ) {
                setDetection("Object detected, but not centered. Move it to the center of the frame.");
            }
            return text;
        }
        return "";
    };

    const startAutoDetect = async () => {
        setAutoDetecting(true);
        setDetection("Auto-detecting... Move to the center.");
        const interval = setInterval(async () => {
            const result = await analyzeCenter();
            if (result.includes("ready")) {
                clearInterval(interval);
                setAutoDetecting(false);
                // Take photo
                if (videoRef.current && canvasRef.current) {
                    const width = videoRef.current.videoWidth;
                    const height = videoRef.current.videoHeight;
                    canvasRef.current.width = width;
                    canvasRef.current.height = height;
                    const ctx = canvasRef.current.getContext("2d");
                    if (ctx) {
                        ctx.drawImage(videoRef.current, 0, 0, width, height);
                        const dataUrl = canvasRef.current.toDataURL("image/png");
                        setPhoto(dataUrl);
                        setDetection("Photo taken! The object is well framed.");
                    }
                }
            }
        }, 3000); // every 3 seconds
        setAutoDetectInterval(interval);
    };

    const stopAutoDetect = () => {
        if (autoDetectInterval) {
            clearInterval(autoDetectInterval);
            setAutoDetectInterval(null);
        }
        setAutoDetecting(false);
        setDetection("");
    };

    // Manual detectCenter function for button
    const detectCenter = async () => {
        setDetection("Detecting...");
        await analyzeCenter();
    };

    // --- Voice Assistant State ---
    const [voiceActive, setVoiceActive] = useState(false);
    const [waitingForDescription, setWaitingForDescription] = useState(false);
    const WAKE_WORD = "vision assist";
    let wakeRecognition: any = null;

    // --- Speech Synthesis Helper ---
    const speak = (text: string, onEnd?: () => void) => {
        const synth = window.speechSynthesis;
        if (synth.speaking) synth.cancel();
        const utter = new window.SpeechSynthesisUtterance(text);
        utter.rate = 1;
        if (onEnd) utter.onend = onEnd;
        synth.speak(utter);
    };

    // --- Wake Word Listener ---
    const startWakeWordListening = () => {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            setError("Speech recognition not supported in this browser.");
            return;
        }
        setError(null);
        setVoiceActive(false);
        setWaitingForDescription(false);
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        wakeRecognition = new SpeechRecognition();
        wakeRecognition.continuous = true;
        wakeRecognition.interimResults = false;
        wakeRecognition.lang = 'en-US';
        wakeRecognition.onresult = (event: any) => {
            const transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
            if (transcript.includes(WAKE_WORD)) {
                setVoiceActive(true);
                setWaitingForDescription(true);
                wakeRecognition.stop();
                startDescriptionListening();
            }
        };
        wakeRecognition.onerror = () => {
            setError("Wake word recognition error.");
        };
        wakeRecognition.start();
        speak("Say 'Vision Assist' to begin.");
    };

    // --- Description Listener ---
    const startDescriptionListening = () => {
        // Wait for voice prompt to finish before starting mic
        speak("How can I help? Please describe what you want to find.", () => {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';
            recognition.onresult = (event: any) => {
                const desc = event.results[0][0].transcript;
                setTranscript(desc);
                setWaitingForDescription(false);
                speak("Starting detection for: " + desc);
                setTimeout(() => startAutoDetectVoice(), 1000);
            };
            recognition.onerror = () => {
                setError("Microphone error or permission denied.");
                setWaitingForDescription(false);
                setVoiceActive(false);
                speak("Sorry, I didn't catch that. Please say 'Vision Assist' to try again.");
                setTimeout(() => startWakeWordListening(), 2000);
            };
            recognition.onend = () => { };
            recognition.start();
        });
    };

    // --- Voice-Driven Auto Detect ---
    const startAutoDetectVoice = async () => {
        setAutoDetecting(true);
        setDetection("Auto-detecting... Move to the center.");
        speak("Move the object to the center of the frame.");
        const interval = setInterval(async () => {
            const result = await analyzeCenter();
            if (result.includes("ready")) {
                clearInterval(interval);
                setAutoDetecting(false);
                if (videoRef.current && canvasRef.current) {
                    const width = videoRef.current.videoWidth;
                    const height = videoRef.current.videoHeight;
                    canvasRef.current.width = width;
                    canvasRef.current.height = height;
                    const ctx = canvasRef.current.getContext("2d");
                    if (ctx) {
                        ctx.drawImage(videoRef.current, 0, 0, width, height);
                        const dataUrl = canvasRef.current.toDataURL("image/png");
                        setPhoto(dataUrl);
                        setDetection("Photo taken! The object is well framed.");
                        speak("Photo taken! The object is well framed.");
                        setTimeout(() => {
                            setVoiceActive(false);
                            setTranscript("");
                            speak("Say 'Vision Assist' to start again.");
                            startWakeWordListening();
                        }, 3000);
                    }
                }
            } else {
                // Speak directions every 5 seconds
                speak(result);
            }
        }, 5000); // every 5 seconds
        setAutoDetectInterval(interval as any);
    };

    // --- On mount, start wake word listening ---
    React.useEffect(() => {
        if (!voiceActive && !waitingForDescription && !autoDetecting) {
            startWakeWordListening();
        }
        // Cleanup on unmount
        return () => {
            if (wakeRecognition) wakeRecognition.stop();
            if (recognition) recognition.stop();
            if (autoDetectInterval) clearInterval(autoDetectInterval);
        };
        // eslint-disable-next-line
    }, []);

    // Auto-start camera on mount
    React.useEffect(() => {
        startCamera();
    }, []);

    // Webcam preview size
    const previewWidth = 480;
    const previewHeight = 360;

    return (
        <div style={{ textAlign: "center" }}>
            <h2>Webcam Preview</h2>
            {error && <div style={{ color: 'red', marginBottom: 10 }}>{error}</div>}
            <div style={{ marginBottom: 10, position: 'relative', width: previewWidth, height: previewHeight, margin: '0 auto' }}>
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    style={{ width: previewWidth, height: previewHeight, border: "4px solid #1976d2", borderRadius: 12, background: '#222', display: streaming ? 'block' : 'none', boxShadow: '0 0 16px #1976d2' }}
                />
                {!streaming && (
                    <div style={{ width: previewWidth, height: previewHeight, border: "4px solid #1976d2", borderRadius: 12, background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', position: 'relative', fontSize: 22, fontWeight: 600, boxShadow: '0 0 16px #1976d2' }}>
                        <span>Camera preview will appear here</span>
                    </div>
                )}
            </div>
            {/* Wake word prompt UI */}
            {(!voiceActive && !waitingForDescription && !autoDetecting) && (
                <div style={{ margin: '24px auto', color: '#1976d2', fontSize: 28, fontWeight: 700, letterSpacing: 1, maxWidth: 600 }}>
                    Say 'Vision Assist' to begin
                </div>
            )}
            <div>
                {/* Hide all manual controls in voice mode */}
                {!voiceActive && !waitingForDescription && !autoDetecting && !streaming && (
                    <button onClick={startCamera}>Start Camera</button>
                )}
            </div>
            {waitingForDescription && (
                <div style={{ marginTop: 10, color: 'blue' }}>
                    Listening for your description...
                </div>
            )}
            {transcript && (
                <div style={{ marginTop: 10, color: '#333' }}>
                    <b>Transcript:</b> {transcript}
                </div>
            )}
            {(!transcript && streaming) && (
                <div style={{ marginTop: 10, color: 'red' }}>
                    Please use the microphone to describe what you want to find before detecting.
                </div>
            )}
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {photo && (
                <div style={{ marginTop: 20 }}>
                    <h3>Photo:</h3>
                    <img src={photo} alt="Captured" style={{ width: 320, height: 240, border: "1px solid #ccc" }} />
                </div>
            )}
            {detection && (
                <div style={{ marginTop: 20 }}>
                    <h3>Center Detection:</h3>
                    <div>{detection}</div>
                </div>
            )}
            {debugDescription && (
                <div style={{ marginTop: 20 }}>
                    <h3>What the model sees:</h3>
                    <div>{debugDescription}</div>
                </div>
            )}
        </div>
    );
};

export default Vision;
