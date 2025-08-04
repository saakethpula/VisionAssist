interface ImportMeta {
    readonly env: {
        [key: string]: string | boolean | undefined;
        VITE_API_URL?: string;
        // Add other environment variables here if needed
    };
}
