import React, { useRef, useState } from "react";

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
    const [lastResponses, setLastResponses] = useState<string[]>([]);
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
            if (
                videoRef.current.readyState < 2 ||
                videoRef.current.videoWidth === 0 ||
                videoRef.current.videoHeight === 0
            ) {
                await new Promise(res => setTimeout(res, 300));
                return analyzeCenter();
            }
            const width = videoRef.current.videoWidth;
            const height = videoRef.current.videoHeight;
            canvasRef.current.width = width;
            canvasRef.current.height = height;
            const ctx = canvasRef.current.getContext("2d");
            let fullFrameBase64 = "";
            if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0, width, height);
                const fullFrameDataUrl = canvasRef.current.toDataURL("image/png");
                fullFrameBase64 = fullFrameDataUrl.replace(/^data:image\/png;base64,/, "");
            }
            let prompt = `USER DESCRIPTION: "${transcript}"

You are a vision assistant for photo framing. Analyze the image and find the object that matches the user's description.

SPATIAL UNDERSTANDING:
- The image shows what the camera sees
- LEFT side of image = object needs to "move right" to get to center
- RIGHT side of image = object needs to "move left" to get to center  
- TOP of image = object needs to "move down" to get to center
- BOTTOM of image = object needs to "move up" to get to center

CENTER DEFINITION:
- TRUE CENTER = middle 40% of both width and height of the frame
- Divide the frame into a 3x3 grid - center is the middle square
- Object should be in this middle area, not just anywhere on the frame

TASK: Find the described object and check if it's in the TRUE CENTER of the frame.

RESPONSE FORMAT:
You must respond in this exact format:
COMMAND: [command]
BBOX: [x1,y1,x2,y2]

Where:
- COMMAND is one of: ready, move left, move right, move up, move down, move closer, move back, not visible
- BBOX is the bounding box coordinates of the detected object (x1,y1 = top-left, x2,y2 = bottom-right)
- Use normalized coordinates from 0.0 to 1.0 (0.0 = left/top edge, 1.0 = right/bottom edge)

RESPONSE COMMANDS:
- "ready" = object is in the center middle area (middle 40% of frame)
- "move left" = object is on the RIGHT side of frame, needs to move toward LEFT
- "move right" = object is on the LEFT side of frame, needs to move toward RIGHT  
- "move up" = object is in BOTTOM portion, needs to move toward TOP
- "move down" = object is in TOP portion, needs to move toward BOTTOM
- "move closer" = object is too small/far away
- "move back" = object is too large/close
- "not visible" = cannot find the described object (use BBOX: [0,0,0,0])

CRITICAL:
- Always provide both COMMAND and BBOX
- Be very careful about left/right directions
- Only say "ready" if object is truly in the center middle area
- Focus on getting the object into the center square of an imaginary 3x3 grid

Example responses:
COMMAND: move left
BBOX: [0.7,0.3,0.9,0.6]

COMMAND: ready
BBOX: [0.4,0.4,0.6,0.6]`;
            const response = await fetch("https://gemini-server-for-vision.onrender.com/api/gemini-vision", {
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

            // Parse the response to extract command and bounding box
            let command = "";
            let bbox = "";

            const lines = text.split('\n');
            for (const line of lines) {
                if (line.includes('command:')) {
                    command = line.split('command:')[1]?.trim() || "";
                }
                if (line.includes('bbox:')) {
                    bbox = line.split('bbox:')[1]?.trim() || "";
                }
            }

            // Display the detection info including bounding box
            const displayText = command ? `${command}${bbox ? ` | BBox: ${bbox}` : ''}` : text;

            // Track responses to prevent getting stuck
            const newResponses = [...lastResponses, command || text].slice(-3); // Keep last 3 responses
            setLastResponses(newResponses);

            // If we've gotten the same response 3 times in a row, force "ready"
            if (newResponses.length === 3 && newResponses.every(r => r === (command || text) && r !== "ready" && r !== "not visible")) {
                setDetection("ready | Forced after repetition");
                return "ready";
            }

            setDetection(displayText);
            return command || text;
        }
        return "";
    };


    const [voiceActive, setVoiceActive] = useState(false);
    const [waitingForDescription, setWaitingForDescription] = useState(false);
    const WAKE_WORD = "vision assist";
    let wakeRecognition: any = null;

    const speak = (text: string, onEnd?: () => void) => {
        const synth = window.speechSynthesis;
        if (synth.speaking) synth.cancel();
        const utter = new window.SpeechSynthesisUtterance(text);
        utter.rate = 1;
        if (onEnd) utter.onend = onEnd;
        synth.speak(utter);
    };

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

    const startDescriptionListening = () => {
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
                speak(result);
            }
        }, 5000);
        setAutoDetectInterval(interval as any);
    };

    React.useEffect(() => {
        if (!voiceActive && !waitingForDescription && !autoDetecting) {
            startWakeWordListening();
        }
        return () => {
            if (wakeRecognition) wakeRecognition.stop();
            if (recognition) recognition.stop();
            if (autoDetectInterval) clearInterval(autoDetectInterval);
        };
    }, []);

    React.useEffect(() => {
        startCamera();
    }, []);

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
            { }
            {(!voiceActive && !waitingForDescription && !autoDetecting) && (
                <div style={{ margin: '24px auto', color: '#1976d2', fontSize: 28, fontWeight: 700, letterSpacing: 1, maxWidth: 600 }}>
                    Say 'Vision Assist' to begin
                </div>
            )}
            <div>
                { }
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
        </div>
    );
};

export default Vision;
