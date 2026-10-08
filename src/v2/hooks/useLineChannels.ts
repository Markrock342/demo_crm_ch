import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createLineChannel,
  deleteLineChannel,
  fetchLineChannels,
  patchLineChannel,
  sendLineTestMessage,
  type DemoChatImage,
  type LineChannel,
  type LineChannelInput,
} from "../../api/cases.ts";

/** Under ["cases"], so anything that refreshes cases also refreshes OA counts. */
export const lineChannelsKey = ["cases", "line", "channels"] as const;

/** Company LINE OAs (case settings › LINE). */
export function useLineChannels(enabled = true) {
  return useQuery<LineChannel[]>({ queryKey: lineChannelsKey, queryFn: fetchLineChannels, enabled });
}

export function useLineChannelActions() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: lineChannelsKey });
  return {
    create: useMutation({ mutationFn: (input: LineChannelInput) => createLineChannel(input), onSuccess: refresh }),
    patch: useMutation({ mutationFn: (v: { id: string; patch: LineChannelInput }) => patchLineChannel(v.id, v.patch), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => deleteLineChannel(id), onSuccess: refresh }),
    /** A pretend customer chat → refreshes the cases board and the OA counts. */
    test: useMutation({
      mutationFn: (v: { id: string; name: string; text: string; image?: DemoChatImage }) =>
        sendLineTestMessage(v.id, { name: v.name, text: v.text, ...(v.image ? { image: v.image } : {}) }),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["cases"] }),
    }),
  };
}
