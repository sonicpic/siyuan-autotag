import { fetchPost } from "siyuan";
import type { ApiResponse } from "./types";

export function kernelRequest<T>(url: string, payload: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    fetchPost(url, payload, (response: ApiResponse<T> | undefined) => {
      if (!response) {
        reject(new Error(`Empty response from ${url}`));
        return;
      }
      if (response.code !== 0) {
        reject(new Error(response.msg || `Kernel request failed: ${url}`));
        return;
      }
      resolve(response.data);
    });
  });
}
