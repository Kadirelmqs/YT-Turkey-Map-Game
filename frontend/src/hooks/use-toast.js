import { useState } from 'react';

export function useToast() {
  const [messages, setMessages] = useState([]);

  function toast(msg) {
    setMessages((m) => [...m, { id: Date.now(), text: msg }]);
    setTimeout(() => setMessages((m) => m.slice(1)), 4000);
  }

  return { messages, toast };
}

export default useToast;
