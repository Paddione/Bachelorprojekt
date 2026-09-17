// system-message-merge — fuehrt system-Nachrichten fuer llamacpp-local zusammen.
//
// Symptom:
// opencode bricht beim Aufruf von Provider llamacpp-local (:1919, FreeToken) ab mit
// "could not encode request: System message must be at the beginning."
//
// Ursache:
// opencode (1.18.31) sendet fuer den Agenten qwen38-primary und den internen
// Titel-Agenten mehrere system-Nachrichten (system, system, user). Das FreeToken-
// Qwen3.6-Chat-Template akzeptiert strikt nur genau eine system-Nachricht an Position 0.
// Frueher wurde dies durch fixups.mjs im llm-proxy und freetoken-active.ts abgefangen.
//
// Warum nicht experimental.chat.system.transform:
// Der experimental.chat.system.transform-Hook in opencode sieht nur einen Eintrag
// und greift nicht auf die tatsaechlich an den Provider gesendeten Nachrichten durch.
// Nur das Umhuellen von options.fetch im config-Hook greift auf den tatsaechlich
// gesendeten Request-Body zu.
//
// Verteilung:
// scripts/opencode-sync-agents.sh verteilt diese Datei nach
// ~/.config/opencode/plugins/system-message-merge.ts, damit opencode sie global laedt.

type MessageContentPart = { type?: string; text?: string; [key: string]: unknown }
type MessageContent = string | MessageContentPart[] | unknown

interface ChatMessage {
  role: string
  content: MessageContent
  [key: string]: unknown
}

interface ChatRequestBody {
  messages?: ChatMessage[]
  [key: string]: unknown
}

function contentToText(content: MessageContent): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part
        if (part && typeof part === "object" && typeof (part as MessageContentPart).text === "string") {
          return (part as MessageContentPart).text as string
        }
        return JSON.stringify(part)
      })
      .join("\n")
  }
  return content == null ? "" : JSON.stringify(content)
}

function mergeSystemMessages(messages: ChatMessage[]): ChatMessage[] {
  const systemMessages: ChatMessage[] = []
  const otherMessages: ChatMessage[] = []

  for (const msg of messages) {
    if (msg.role === "system") {
      systemMessages.push(msg)
    } else {
      otherMessages.push(msg)
    }
  }

  if (systemMessages.length === 0) {
    return messages
  }

  // Genau eine system-Nachricht an Position 0 -> unveraendert
  if (systemMessages.length === 1 && messages[0].role === "system") {
    return messages
  }

  const mergedContent = systemMessages
    .map((msg) => contentToText(msg.content))
    .join("\n\n")

  const mergedSystemMessage: ChatMessage = {
    role: "system",
    content: mergedContent,
  }

  return [mergedSystemMessage, ...otherMessages]
}

export const SystemMessageMerge = async () => {
  return {
    config: async (cfg: any) => {
      const provider = cfg?.provider?.["llamacpp-local"]
      if (!provider) return

      provider.options = provider.options ?? {}
      const upstream = provider.options.fetch ?? globalThis.fetch

      provider.options.fetch = async (input: any, init?: any) => {
        if (!init || typeof init.body !== "string") {
          return upstream(input, init)
        }

        let bodyObj: ChatRequestBody
        try {
          bodyObj = JSON.parse(init.body)
        } catch {
          return upstream(input, init)
        }

        if (!bodyObj || !Array.isArray(bodyObj.messages)) {
          return upstream(input, init)
        }

        const newMessages = mergeSystemMessages(bodyObj.messages)
        if (newMessages === bodyObj.messages) {
          return upstream(input, init)
        }

        const newInit = {
          ...init,
          body: JSON.stringify({
            ...bodyObj,
            messages: newMessages,
          }),
        }

        return upstream(input, newInit)
      }
    },
  }
}
