import socket
import threading
import time
import os
import json
from datetime import datetime

class LocalSMTPServer:
    def __init__(self, host="0.0.0.0", port=25):
        self.host = host
        self.port = port
        self.server_socket = None
        self.is_running = False
        self.received_emails = []
        self.storage_dir = os.path.join(os.path.dirname(__file__), "..", "storage", "sent_emails")
        os.makedirs(self.storage_dir, exist_ok=True)

    def start(self):
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(10)
            self.is_running = True
            print(f"[SMTP] Local SMTP Server listening on {self.host}:{self.port}")
            thread = threading.Thread(target=self._listen_loop, daemon=True)
            thread.start()
            return True, f"Local SMTP Server started on {self.host}:{self.port}"
        except Exception as e:
            print(f"[SMTP] Could not start local SMTP server on port {self.port}: {e}")
            return False, str(e)

    def stop(self):
        self.is_running = False
        if self.server_socket:
            try:
                self.server_socket.close()
            except:
                pass

    def _listen_loop(self):
        while self.is_running:
            try:
                client_sock, addr = self.server_socket.accept()
                t = threading.Thread(target=self._handle_client, args=(client_sock, addr), daemon=True)
                t.start()
            except Exception:
                break

    def _handle_client(self, sock, addr):
        try:
            sock.settimeout(10.0)
            sock.sendall(b"220 Local UBL SMTP Service Ready\r\n")
            mail_from = ""
            rcpt_to = []
            in_data = False
            data_buffer = []

            raw_stream = ""
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                raw_stream += chunk.decode("utf-8", errors="ignore")
                
                while "\r\n" in raw_stream:
                    line, raw_stream = raw_stream.split("\r\n", 1)
                    if in_data:
                        if line == ".":
                            in_data = False
                            body = "\r\n".join(data_buffer)
                            email_record = {
                                "timestamp": datetime.now().isoformat(),
                                "from": mail_from,
                                "to": rcpt_to,
                                "body": body,
                                "client_ip": addr[0]
                            }
                            self.received_emails.append(email_record)
                            file_name = f"email_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.json"
                            with open(os.path.join(self.storage_dir, file_name), "w", encoding="utf-8") as f:
                                json.dump(email_record, f, indent=2)
                            sock.sendall(b"250 2.0.0 OK Message accepted for delivery\r\n")
                            data_buffer = []
                        else:
                            if line.startswith(".."):
                                line = line[1:]
                            data_buffer.append(line)
                    else:
                        cmd_upper = line.upper().strip()
                        if cmd_upper.startswith("EHLO") or cmd_upper.startswith("HELO"):
                            sock.sendall(b"250-Local-SMTP Hello\r\n250-SIZE 35651584\r\n250 OK\r\n")
                        elif cmd_upper.startswith("MAIL FROM:"):
                            mail_from = line[10:].strip("<> ")
                            sock.sendall(b"250 2.1.0 Sender OK\r\n")
                        elif cmd_upper.startswith("RCPT TO:"):
                            rcpt = line[8:].strip("<> ")
                            rcpt_to.append(rcpt)
                            sock.sendall(b"250 2.1.5 Recipient OK\r\n")
                        elif cmd_upper == "DATA":
                            in_data = True
                            data_buffer = []
                            sock.sendall(b"354 Start mail input; end with <CR><LF>.<CR><LF>\r\n")
                        elif cmd_upper == "QUIT":
                            sock.sendall(b"221 2.0.0 Service closing transmission channel\r\n")
                            return
                        elif cmd_upper in ("NOOP", "RSET"):
                            sock.sendall(b"250 OK\r\n")
                        else:
                            sock.sendall(b"250 OK\r\n")
        except Exception as e:
            print("[SMTP] Local SMTP client error:", e)
        finally:
            try:
                sock.close()
            except:
                pass

smtp_server = LocalSMTPServer()
