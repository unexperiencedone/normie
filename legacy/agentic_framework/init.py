import os
from langchain_nvidia_ai_endpoints import ChatNVIDIA


client = ChatNVIDIA(
  model="nvidia/nemotron-3-ultra-550b-a55b",
  api_key=os.environ.get("AGENT_API_KEY", ""), 
  temperature=1,
  top_p=0.95,
  max_completion_tokens=16384,
  chat_template_kwargs={"enable_thinking":True},
)

for chunk in client.stream([{"role":"user","content":"Can you help me understand cybersecurity fundamentals and learn how to protect and hack into a software"}]):
  
    if chunk.additional_kwargs and "reasoning_content" in chunk.additional_kwargs:
      print(chunk.additional_kwargs["reasoning_content"], end="")
  
    print(chunk.content, end="")