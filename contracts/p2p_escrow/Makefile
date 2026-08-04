# P2P Escrow Contract - Build Configuration
# BEAM Privacy Blockchain Smart Contract
#
# Prerequisites:
# 1. LLVM/Clang with WebAssembly target
# 2. BEAM shader headers from: https://github.com/BeamMW/beam/tree/master/bvm/Shaders
#
# Install on macOS:
#   brew install llvm
#   export PATH="/opt/homebrew/opt/llvm/bin:$PATH"
#
# Setup BEAM headers:
#   git clone https://github.com/BeamMW/beam.git --depth 1
#   export BEAM_SHADERS=/path/to/beam/bvm/Shaders

# Configuration
CLANG ?= clang
BEAM_SHADERS ?= $(HOME)/beam/bvm/Shaders

# Compiler flags for WebAssembly
CFLAGS = -O3 \
         --target=wasm32 \
         -I$(BEAM_SHADERS) \
         -Wl,--export-dynamic,--no-entry,--allow-undefined \
         -nostdlib \
         -fno-exceptions \
         -fno-rtti

# Output files
CONTRACT = contract.wasm
APP = app.wasm

# Source files
CONTRACT_SRC = contract.cpp
APP_SRC = app.cpp

.PHONY: all clean check-env help

all: check-env $(CONTRACT) $(APP)

# Check that BEAM shader headers exist
check-env:
	@if [ ! -f "$(BEAM_SHADERS)/common.h" ]; then \
		echo "Error: BEAM shader headers not found!"; \
		echo ""; \
		echo "Please download BEAM shader headers:"; \
		echo "  git clone https://github.com/BeamMW/beam.git --depth 1"; \
		echo "  export BEAM_SHADERS=/path/to/beam/bvm/Shaders"; \
		echo ""; \
		echo "Or set BEAM_SHADERS when running make:"; \
		echo "  make BEAM_SHADERS=/path/to/beam/bvm/Shaders"; \
		exit 1; \
	fi
	@echo "BEAM shaders found at: $(BEAM_SHADERS)"

# Build contract shader (runs on validators)
$(CONTRACT): $(CONTRACT_SRC) contract.h
	@echo "Building contract shader..."
	$(CLANG) $(CFLAGS) -o $@ $(CONTRACT_SRC)
	@echo "Built: $@ ($(shell wc -c < $@ | tr -d ' ') bytes)"

# Build app shader (runs on client)
$(APP): $(APP_SRC) contract.h
	@echo "Building app shader..."
	$(CLANG) $(CFLAGS) -o $@ $(APP_SRC)
	@echo "Built: $@ ($(shell wc -c < $@ | tr -d ' ') bytes)"

clean:
	rm -f $(CONTRACT) $(APP)

help:
	@echo "P2P Escrow Contract Build System"
	@echo ""
	@echo "Usage:"
	@echo "  make              - Build all shaders"
	@echo "  make contract.wasm - Build contract shader only"
	@echo "  make app.wasm     - Build app shader only"
	@echo "  make clean        - Remove built files"
	@echo "  make help         - Show this help"
	@echo ""
	@echo "Configuration:"
	@echo "  BEAM_SHADERS - Path to BEAM shader headers (default: ~/beam/bvm/Shaders)"
	@echo "  CLANG        - Clang compiler path (default: clang)"
	@echo ""
	@echo "Example:"
	@echo "  make BEAM_SHADERS=/opt/beam/bvm/Shaders"
