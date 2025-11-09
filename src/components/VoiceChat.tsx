import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Bot, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { AnalyticsData } from '@/hooks/useAnalyticsData';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface VoiceChatProps {
  analyticsData: AnalyticsData;
}

export const VoiceChat = ({ analyticsData }: VoiceChatProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I'm your voice assistant. Click the microphone to speak.",
      timestamp: new Date()
    }
  ]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => {
        console.log('🎤 Speech recognition started');
        setIsListening(true);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;

        const userMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content: transcript,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setIsProcessing(true);

        // Get AI response
        try {
          const response = await fetch('http://localhost:3001/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: transcript,
              analyticsData
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to get response from AI');
          }

          const data = await response.json();

          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: data.response || 'Sorry, I couldn\'t process that request.',
            timestamp: new Date()
          };

          setMessages(prev => [...prev, assistantMessage]);

          // Speak the response
          speakText(data.response);
        } catch (error) {
          console.error('Voice chat error:', error);
          toast.error('Failed to get AI response');

          const errorMessage = 'Sorry, I\'m having trouble connecting to the AI server.';
          const errorMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: errorMessage,
            timestamp: new Date()
          };

          setMessages(prev => [...prev, errorMsg]);
          speakText(errorMessage);
        } finally {
          setIsProcessing(false);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);

        if (event.error === 'not-allowed') {
          toast.error('Microphone access denied', {
            description: 'Please allow microphone access to use voice chat'
          });
        } else if (event.error === 'no-speech') {
          toast.error('No speech detected', {
            description: 'Please try speaking again'
          });
        }
      };
    } else {
      setIsSupported(false);
      console.error('❌ Speech recognition not supported in this browser');
      toast.error('Speech recognition not supported', {
        description: 'Please use Chrome, Edge, or Safari for voice features'
      });
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (synthesisRef.current) {
        window.speechSynthesis.cancel();
      }
    };
  }, [analyticsData]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const speakText = (text: string) => {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Remove markdown formatting for speech
    const cleanText = text
      .replace(/\*\*/g, '')
      .replace(/•/g, '')
      .replace(/\n/g, '. ');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
    };

    synthesisRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening && !isProcessing) {
      try {
        console.log('🎤 Attempting to start speech recognition...');
        recognitionRef.current.start();
      } catch (error) {
        console.error('❌ Error starting speech recognition:', error);
        toast.error('Failed to start microphone', {
          description: 'Please check your microphone permissions'
        });
      }
    } else {
      console.log('🎤 Cannot start:', {
        hasRecognition: !!recognitionRef.current,
        isListening,
        isProcessing
      });
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  return (
    <Card className="bg-primary/10 border-primary/20 h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" />
          Voice Assistant
        </CardTitle>
        <p className="text-xs text-muted-foreground">Speak to get voice responses</p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 pb-4 overflow-hidden">
        {/* Messages Area */}
        <div
          ref={scrollRef}
          className="flex-1 px-4 overflow-y-auto"
          style={{ minHeight: 0 }}
        >
          <div className="space-y-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div
                  className={`rounded-lg px-4 py-2 max-w-[80%] ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card border border-border'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className="text-xs opacity-60 mt-1">
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent flex items-center justify-center flex-shrink-0">
                    <Mic className="w-4 h-4 text-accent" />
                  </div>
                )}
              </div>
            ))}
            {isProcessing && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-card border border-border rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse delay-100"></div>
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse delay-200"></div>
                    <span className="text-sm text-muted-foreground ml-2">Processing...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Voice Controls */}
        <div className="px-4 pt-4 border-t border-border">
          <div className="flex gap-3 justify-center items-center">
            {/* Microphone Button */}
            <Button
              onClick={isListening ? stopListening : startListening}
              disabled={isProcessing || !isSupported}
              size="lg"
              className={`relative ${
                isListening
                  ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                  : 'bg-primary hover:bg-primary/90'
              }`}
            >
              {isListening ? (
                <>
                  <MicOff className="w-5 h-5 mr-2" />
                  Stop Listening
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5 mr-2" />
                  {isProcessing ? 'Processing...' : isSupported ? 'Start Speaking' : 'Not Supported'}
                </>
              )}
            </Button>

            {/* Speaker Button */}
            {isSpeaking && (
              <Button
                onClick={stopSpeaking}
                variant="outline"
                size="lg"
                className="animate-pulse"
              >
                <VolumeX className="w-5 h-5 mr-2" />
                Stop Speaking
              </Button>
            )}
          </div>

          <div className="mt-3 text-center">
            {isListening && (
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                <p className="text-sm text-red-500 font-semibold">Listening...</p>
              </div>
            )}
            {isSpeaking && (
              <div className="flex items-center justify-center gap-2">
                <Volume2 className="w-4 h-4 text-primary animate-pulse" />
                <p className="text-sm text-primary font-semibold">Speaking...</p>
              </div>
            )}
            {!isListening && !isSpeaking && !isProcessing && (
              <p className="text-xs text-muted-foreground">
                Click microphone and ask about detections, cameras, or alerts
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
