import { createContext, useContext, ReactNode } from 'react';
import { useSentimentAnalysis, SentimentAnalysisResponse } from '@/hooks/use-sentiment-analysis';
import { UseQueryResult } from '@tanstack/react-query';

type SentimentContextValue = UseQueryResult<SentimentAnalysisResponse, Error>;

const SentimentContext = createContext<SentimentContextValue | undefined>(undefined);

export function SentimentProvider({
  ticker,
  children
}: {
  ticker: string;
  children: ReactNode;
}) {
  const sentimentQuery = useSentimentAnalysis(ticker);

  return (
    <SentimentContext.Provider value={sentimentQuery}>
      {children}
    </SentimentContext.Provider>
  );
}

export function useSentimentShared() {
  const context = useContext(SentimentContext);
  if (!context) {
    throw new Error('useSentimentShared must be used within SentimentProvider');
  }
  return context;
}
