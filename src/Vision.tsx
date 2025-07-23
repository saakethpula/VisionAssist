import React, { useRef, useState, useEffect } from "react";

const Vision: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [photo, setPhoto] = useState<string | null>(null);
    const [streaming, setStreaming] = useState(false);
    const [geminiResponse, setGeminiResponse] = useState<string>("");
    const [detectedObjects, setDetectedObjects] = useState<Array<{ name: string; x: number; y: number; direction: string }>>([]);
    const [targetObject, setTargetObject] = useState<string>("");
    const [micTranscript, setMicTranscript] = useState<string>("");


    const speak = (text: string, onEnd?: () => void) => {
        const synth = window.speechSynthesis;
        if (synth.speaking) synth.cancel();
        const utter = new window.SpeechSynthesisUtterance(text);
        if (onEnd) utter.onend = onEnd;
        synth.speak(utter);
    };

    const captureFrame = (): string | null => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                return canvas.toDataURL("image/jpeg");
            }
        }
        return null;
    };

    const analyzeFrameWithGemini = async () => {
        const dataUrl = captureFrame();
        if (!dataUrl) return;
        try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5180';
            const response = await fetch(`${apiUrl}/api/gemini-vision`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageBase64: dataUrl.split(',')[1] })
            });
            const data = await response.json();
            if (data.text) {
                setGeminiResponse(data.text);
                const objects = parseObjectsFromGemini(data.text);
                setDetectedObjects(objects);
                if (targetObject) {
                    analyzeGeminiForObject(data.text);
                }
            } else {
                setDetectedObjects([]);
            }
        } catch (error) {
            setDetectedObjects([]);
        }
    };
    function parseObjectsFromGemini(response: string): Array<{ name: string; x: number; y: number; direction: string }> {

        const lines = response.split('\n');
        const objects: Array<{ name: string; x: number; y: number; direction: string }> = [];
        const regex = /([\w\s]+)\s*\(x:\s*(-?\d+),\s*y:\s*(-?\d+)\)\s*-\s*(.*)/i;
        for (const line of lines) {
            const match = line.match(regex);
            if (match) {
                objects.push({
                    name: match[1].trim(),
                    x: parseInt(match[2], 10),
                    y: parseInt(match[3], 10),
                    direction: match[4].trim()
                });
            }
        }
        return objects;
    }

    const startCamera = async () => {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    setStreaming(true);
                }
            } catch (err) {
                // Camera error ignored
            }
        } else {
            // Camera not supported error ignored
        }
    };

    // Always-on microphone for object description (no error handling)
    useEffect(() => {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            return;
        }
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.onresult = (event: any) => {
            let interimTranscript = '';
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            setMicTranscript(interimTranscript + finalTranscript);
            if (finalTranscript) {
                setTargetObject(finalTranscript.trim());
                speak(`Looking for: ${finalTranscript.trim()}`);
            }
        };
        recognition.onend = () => {
            setTimeout(() => {
                try { recognition.start(); } catch (e) { }
            }, 1000);
        };
        recognition.start();
        return () => {
            recognition.stop();
        };
    }, []);

    // Analyze Gemini response for object and give directions
    const analyzeGeminiForObject = (responseText: string) => {
        if (!targetObject) return;
        const lowerResponse = responseText.toLowerCase();
        const lowerTarget = targetObject.toLowerCase();
        if (lowerResponse.includes(lowerTarget)) {
            speak(`The ${targetObject} is in the frame. Please center it and hold still for a photo.`);
            setTimeout(() => takePhoto(), 2000);
        } else {
            speak(`Move the camera, the ${targetObject} is not in the frame.`);
        }
    };

    // Take a photo and show it in the UI
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
                speak("Photo taken!");
            }
        }
    };

    useEffect(() => {
        startCamera();
    }, []);

    // Start analyzing frames as soon as the camera is streaming
    useEffect(() => {
        if (streaming) {
            const interval = setInterval(() => {
                analyzeFrameWithGemini();
            }, 5000); // Analyze every 5 seconds
            return () => clearInterval(interval);
        }
    }, [streaming]);

    const previewWidth = 480;
    const previewHeight = 360;

    return (
        <div style={{ textAlign: "center" }}>
            <h2>Webcam Preview</h2>
            <div style={{ color: '#1976d2', fontSize: 22, margin: 16 }}>
                <span style={{ color: '#888', fontSize: 16 }}>(Transcript: {micTranscript})</span>
            </div>
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
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {photo && (
                <div style={{ marginTop: 20 }}>
                    <h3>Photo:</h3>
                    <img src={photo} alt="Captured" style={{ width: 320, height: 240, border: "1px solid #ccc" }} />
                </div>
            )}
            {/* Gemini Vision raw response below camera */}
            {geminiResponse && (
                <div style={{ marginTop: 24, marginBottom: 8, maxWidth: 600, marginLeft: 'auto', marginRight: 'auto', background: '#f0f4fa', borderRadius: 10, boxShadow: '0 0 6px #1976d2', padding: 12, color: '#222', fontSize: 16 }}>
                    <strong>Gemini Vision Response:</strong>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, background: 'none', color: '#1976d2' }}>{geminiResponse}</pre>
                </div>
            )}
            {/* Gemini detected objects list at the bottom */}
            {detectedObjects.length > 0 && (
                <div style={{ marginTop: 24, marginBottom: 16, textAlign: 'left', maxWidth: 600, marginLeft: 'auto', marginRight: 'auto', background: '#f7f7fa', borderRadius: 12, boxShadow: '0 0 8px #1976d2', padding: 16 }}>
                    <h3 style={{ color: '#1976d2' }}>Objects Detected by Gemini:</h3>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {detectedObjects.map((obj, idx) => (
                            <li key={idx} style={{ marginBottom: 12, fontSize: 18, color: '#333', borderBottom: '1px solid #e0e0e0', paddingBottom: 8 }}>
                                <strong>{obj.name}</strong> &nbsp;
                                <span style={{ color: '#1976d2' }}>
                                    (x: {obj.x}, y: {obj.y})
                                </span>
                                <br />
                                <span style={{ color: '#555' }}>Direction: {obj.direction}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default Vision;
