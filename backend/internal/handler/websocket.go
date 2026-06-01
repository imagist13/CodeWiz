package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // allow all origins in development
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

// Client represents a connected WebSocket client.
type Client struct {
	ID     string
	UserID uuid.UUID
	Conn   *websocket.Conn
	Send   chan []byte
}

// Hub manages all connected WebSocket clients.
type Hub struct {
	clients    map[*Client]bool
	userMap    map[uuid.UUID][]*Client
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		userMap:    make(map[uuid.UUID][]*Client),
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.userMap[client.UserID] = append(h.userMap[client.UserID], client)
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
				// Remove from userMap
				clients := h.userMap[client.UserID]
				for i, c := range clients {
					if c == client {
						h.userMap[client.UserID] = append(clients[:i], clients[i+1:]...)
						break
					}
				}
				if len(h.userMap[client.UserID]) == 0 {
					delete(h.userMap, client.UserID)
				}
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// BroadcastToUser sends a message to all connections of a specific user.
func (h *Hub) BroadcastToUser(userID uuid.UUID, eventType string, payload interface{}) error {
	data := map[string]interface{}{
		"type":    eventType,
		"payload": payload,
	}
	bytes, err := json.Marshal(data)
	if err != nil {
		return err
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, client := range h.userMap[userID] {
		select {
		case client.Send <- bytes:
		default:
		}
	}
	return nil
}

// BroadcastToProject sends a message to all clients watching a project.
// Clients are identified by their connection's query param; this is a simplified
// broadcast that sends to all connected clients.
func (h *Hub) BroadcastToProject(projectID string, eventType string, payload interface{}) {
	data := map[string]interface{}{
		"type":       eventType,
		"payload":    payload,
		"project_id": projectID,
	}
	bytes, err := json.Marshal(data)
	if err != nil {
		log.Printf("WS broadcast error: %v", err)
		return
	}
	h.broadcast <- bytes
}

// WSHandler handles WebSocket connections.
type WSHandler struct {
	hub *Hub
}

func NewWSHandler(hub *Hub) *WSHandler {
	return &WSHandler{hub: hub}
}

func (h *WSHandler) Handle(c echo.Context) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "unauthorized")
	}

	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return err
	}

	client := &Client{
		ID:     uuid.New().String(),
		UserID: userID,
		Conn:   conn,
		Send:   make(chan []byte, 256),
	}

	h.hub.register <- client

	go h.writePump(client)
	go h.readPump(client)

	return nil
}

func (h *WSHandler) writePump(client *Client) {
	defer func() {
		client.Conn.Close()
	}()

	for {
		message, ok := <-client.Send
		if !ok {
			client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
			return
		}
		if err := client.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
			return
		}
	}
}

func (h *WSHandler) readPump(client *Client) {
	defer func() {
		h.hub.unregister <- client
		client.Conn.Close()
	}()

	for {
		_, _, err := client.Conn.ReadMessage()
		if err != nil {
			break
		}
	}
}
