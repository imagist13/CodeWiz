package services

import (
	"adorable-backend/internal/models"
	"adorable-backend/internal/repositories"

	"github.com/google/uuid"
)

type UserService struct {
	userRepo *repositories.UserRepository
}

func NewUserService(userRepo *repositories.UserRepository) *UserService {
	return &UserService{userRepo: userRepo}
}

func (s *UserService) GetByID(id uuid.UUID) (*models.User, error) {
	return s.userRepo.FindByID(id)
}

func (s *UserService) UpdateProfile(id uuid.UUID, name string) (*models.User, error) {
	user, err := s.userRepo.FindByID(id)
	if err != nil {
		return nil, err
	}

	if name != "" {
		user.Name = name
	}

	err = s.userRepo.Update(user)
	return user, err
}
