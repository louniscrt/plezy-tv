export function origin(url: string): string | undefined;
export function televisionUrl(url: string): string;
export function retryUrl(server: string, serial: number): string;
export function isTelevisionPage(url: string, server: string): boolean;
export function isWebEntry(url: string, server: string): boolean;
export function isDocumentError(event: {url?: string; isMainFrame?: boolean}, uri: string): boolean;
