import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScoreRecord } from "../backend.d";
import { useActor } from "./useActor";

export function useGetTopScores() {
  const { actor, isFetching } = useActor();
  return useQuery<ScoreRecord[]>({
    queryKey: ["topScores"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getTopScores();
    },
    enabled: !!actor && !isFetching,
    staleTime: 30_000,
  });
}

export function useSubmitScore() {
  const { actor } = useActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      playerName,
      score,
    }: { playerName: string; score: number }) => {
      if (!actor) throw new Error("Not connected");
      await actor.submitScore(playerName, BigInt(score));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topScores"] });
    },
  });
}
