// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract NFTicket is ERC721, Ownable, ReentrancyGuard {
    uint256 private _nextTokenId;
    uint256 private _nextEventId;

    uint256 public protocolFeePercent = 2; // 1-10%, adjustable by owner
    uint256 public developerBalance;

    struct Event {
        address organizer;
        uint256 totalTickets;
        uint256 ticketsMinted;
        uint256 ticketPrice; // primary sale price (wei)
        uint256 maxResalePrice; // resale price ceiling (wei)
        uint256 maxResaleCount; // max resales per ticket (0 = unlimited)
        bool isActive;
        string metadataURI; // IPFS URI for event info (name, date, venue, image)
        string seatMapURI;  // IPFS URI for seat layout data
    }

    struct TicketDetails {
        uint256 eventId;
        uint256 seatId;
        uint256 maxPrice;
        uint256 currentAskingPrice;
        bool isForSale;
        bool isUsed;
        uint256 resaleCount;
        uint256 maxResaleCount;
    }

    mapping(uint256 => Event) public events;
    mapping(uint256 => TicketDetails) public ticketSpecs;
    mapping(address => bool) private _admins;
    mapping(address => bool) private _checkInStaffs;
    // track whether an address has ever been given a role,
    // so the same wallet cannot hold both admin and check-in roles
    mapping(address => bool) private _appointedOnce;
    mapping(uint256 => mapping(uint256 => bool)) private _seatTaken;

    event EventCreated(
        uint256 indexed eventId,
        address indexed organizer,
        string metadataURI,
        string seatMapURI
    );
    event TicketMinted(
        uint256 indexed tokenId,
        uint256 indexed eventId,
        uint256 indexed seatId,
        address to
    );
    event TicketPriceUpdated(uint256 indexed tokenId, uint256 newPrice, bool forSale);
    event TicketSold(uint256 indexed tokenId, address indexed buyer, uint256 pricePaid);
    event TicketCheckedIn(uint256 indexed tokenId, address indexed attendee);
    event ProtocolFeeUpdated(uint256 newFee);
    event DeveloperProfitsWithdrawn(uint256 amount);
    event EventStatusUpdated(uint256 indexed eventId, bool isActive);
    event AdminRoleUpdated(address indexed account, bool enabled);
    event CheckInStaffRoleUpdated(address indexed account, bool enabled);

    constructor() ERC721("NFTicket", "NFTK") Ownable(msg.sender) {}

    modifier onlyAdminOrOwner() {
        require(msg.sender == owner() || _admins[msg.sender], "Not owner/admin");
        _;
    }

    function createEvent(
        uint256 totalTickets,
        uint256 ticketPrice,
        uint256 maxResalePrice,
        uint256 maxResaleCount,
        string memory metadataURI,
        string memory seatMapURI
    ) public onlyAdminOrOwner returns (uint256) {
        require(totalTickets > 0, "Total tickets must be > 0");
        require(maxResalePrice >= ticketPrice, "Max resale below ticket price");
        require(bytes(metadataURI).length > 0, "Missing metadata URI");
        require(bytes(seatMapURI).length > 0, "Missing seat map URI");

        uint256 eventId = _nextEventId++;
        events[eventId] = Event({
            organizer: msg.sender,
            totalTickets: totalTickets,
            ticketsMinted: 0,
            ticketPrice: ticketPrice,
            maxResalePrice: maxResalePrice,
            maxResaleCount: maxResaleCount,
            isActive: true,
            metadataURI: metadataURI,
            seatMapURI: seatMapURI
        });

        emit EventCreated(eventId, msg.sender, metadataURI, seatMapURI);
        return eventId;
    }

    
    function buyFromEvent(uint256 eventId, uint256 seatId) public payable nonReentrant {
        Event storage ev = events[eventId];
        require(ev.isActive, "Event not active");
        require(ev.ticketsMinted < ev.totalTickets, "Sold out");
        require(seatId < ev.totalTickets, "Invalid seat");
        require(!_seatTaken[eventId][seatId], "Seat already taken");
        require(msg.value >= ev.ticketPrice, "Insufficient payment");

        uint256 pricePaid = ev.ticketPrice;
        uint256 excess = msg.value - pricePaid;

        uint256 protocolFee = (pricePaid * protocolFeePercent) / 100;
        uint256 organizerAmount = pricePaid - protocolFee;

        uint256 tokenId = _nextTokenId++;
        ev.ticketsMinted++;
        developerBalance += protocolFee;
        _seatTaken[eventId][seatId] = true;

        _safeMint(msg.sender, tokenId);

        ticketSpecs[tokenId] = TicketDetails({
            eventId: eventId,
            seatId: seatId,
            maxPrice: ev.maxResalePrice,
            currentAskingPrice: ev.maxResalePrice,
            isForSale: false,
            isUsed: false,
            resaleCount: 0,
            maxResaleCount: ev.maxResaleCount
        });

        (bool paid, ) = payable(ev.organizer).call{value: organizerAmount}("");
        require(paid, "Organizer payment failed");

        if (excess > 0) {
            (bool refunded, ) = payable(msg.sender).call{value: excess}("");
            require(refunded, "Refund failed");
        }

        emit TicketMinted(tokenId, eventId, seatId, msg.sender);
    }

    function checkIn(uint256 tokenId) public {
        TicketDetails storage ticket = ticketSpecs[tokenId];
        address organizer = events[ticket.eventId].organizer;

        require(
            msg.sender == organizer ||
                msg.sender == owner() ||
                _admins[msg.sender] ||
                _checkInStaffs[msg.sender],
            "Not authorized to check in"
        );
        require(!ticket.isUsed, "Ticket already used");

        ticket.isUsed = true;
        ticket.isForSale = false;
        emit TicketCheckedIn(tokenId, ownerOf(tokenId));
    }

    function setTicketPrice(uint256 tokenId, uint256 newPrice, bool forSale) public {
        TicketDetails storage ticket = ticketSpecs[tokenId];
        require(ownerOf(tokenId) == msg.sender || owner() == msg.sender, "Not authorized");
        require(newPrice <= ticket.maxPrice, "Exceeds max resale price");
        require(!ticket.isUsed, "Ticket already used");
        require(
            ticket.maxResaleCount == 0 || ticket.resaleCount < ticket.maxResaleCount,
            "Max resales reached"
        );

        ticket.currentAskingPrice = newPrice;
        ticket.isForSale = forSale;
        emit TicketPriceUpdated(tokenId, newPrice, forSale);
    }

    function buyTicket(uint256 tokenId) public payable nonReentrant {
        TicketDetails storage ticket = ticketSpecs[tokenId];
        address seller = ownerOf(tokenId);

        require(!ticket.isUsed, "Ticket already used");
        require(ticket.isForSale, "Not for sale");
        require(msg.value >= ticket.currentAskingPrice, "Insufficient funds");
        require(msg.sender != seller, "Cannot buy your own ticket");
        if (ticket.maxResaleCount > 0) {
            require(ticket.resaleCount < ticket.maxResaleCount, "Max resales reached");
        }

        uint256 pricePaid = ticket.currentAskingPrice;
        uint256 excess = msg.value - pricePaid;

        uint256 protocolFee = (pricePaid * protocolFeePercent) / 100;
        uint256 sellerAmount = pricePaid - protocolFee;

        developerBalance += protocolFee;
        ticket.resaleCount++;
        ticket.isForSale = false;

        _transfer(seller, msg.sender, tokenId);

        (bool sellerPaid, ) = payable(seller).call{value: sellerAmount}("");
        require(sellerPaid, "Seller payment failed");

        if (excess > 0) {
            (bool refunded, ) = payable(msg.sender).call{value: excess}("");
            require(refunded, "Refund failed");
        }

        emit TicketSold(tokenId, msg.sender, pricePaid);
    }

    function setAdmin(address account, bool enabled) public onlyOwner {
        require(account != address(0), "Invalid account");
        require(account != owner(), "Owner already super owner");
        if (enabled) {
            require(!_appointedOnce[account], "Account already appointed");
            require(!_admins[account], "Already admin");
            require(!_checkInStaffs[account], "Already check-in staff");
            _appointedOnce[account] = true;
        }
        _admins[account] = enabled;
        emit AdminRoleUpdated(account, enabled);
    }

    function setCheckInStaff(address account, bool enabled) public onlyOwner {
        require(account != address(0), "Invalid account");
        require(account != owner(), "Owner cannot be check-in staff");
        if (enabled) {
            require(!_appointedOnce[account], "Account already appointed");
            require(!_checkInStaffs[account], "Already check-in staff");
            require(!_admins[account], "Already admin");
            _appointedOnce[account] = true;
        }
        _checkInStaffs[account] = enabled;
        emit CheckInStaffRoleUpdated(account, enabled);
    }

    function isAdmin(address account) public view returns (bool) {
        return account == owner() || _admins[account];
    }

    function isCheckInStaff(address account) public view returns (bool) {
        return _checkInStaffs[account];
    }

    function hasBeenAppointed(address account) public view returns (bool) {
        return _appointedOnce[account];
    }

    function isSeatTaken(uint256 eventId, uint256 seatId) public view returns (bool) {
        return _seatTaken[eventId][seatId];
    }

    function setProtocolFee(uint256 newFee) public onlyOwner {
        require(newFee >= 1 && newFee <= 10, "Fee must be 1-10");
        protocolFeePercent = newFee;
        emit ProtocolFeeUpdated(newFee);
    }
    
    function setEventActive(uint256 eventId, bool active) public onlyAdminOrOwner {
        require(eventId < _nextEventId, "Event does not exist");
        Event storage ev = events[eventId];
        require(bytes(ev.metadataURI).length > 0, "Event does not exist");
        ev.isActive = active;
        emit EventStatusUpdated(eventId, active);
    }

    function withdrawDeveloperProfits() public onlyOwner {
        uint256 amount = developerBalance;
        require(amount > 0, "Nothing to withdraw");

        developerBalance = 0;
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Withdrawal failed");
        emit DeveloperProfitsWithdrawn(amount);
    }

    function getEventDetails(uint256 eventId)
        public
        view
        returns (
            address organizer,
            uint256 totalTickets,
            uint256 ticketsMinted,
            uint256 ticketPrice,
            uint256 maxResalePrice,
            uint256 maxResaleCount,
            bool isActive,
            string memory metadataURI,
            string memory seatMapURI
        )
    {
        Event storage ev = events[eventId];
        return (
            ev.organizer,
            ev.totalTickets,
            ev.ticketsMinted,
            ev.ticketPrice,
            ev.maxResalePrice,
            ev.maxResaleCount,
            ev.isActive,
            ev.metadataURI,
            ev.seatMapURI
        );
    }

    function getTicketInfo(uint256 tokenId)
        public
        view
        returns (
            address currentOwner,
            uint256 eventId,
            uint256 seatId,
            uint256 maxAllowedPrice,
            uint256 currentPrice,
            bool forSaleStatus,
            bool isUsed,
            uint256 totalResales,
            uint256 maxResales,
            string memory metadataURI
        )
    {
        TicketDetails storage t = ticketSpecs[tokenId];
        return (
            ownerOf(tokenId),
            t.eventId,
            t.seatId,
            t.maxPrice,
            t.currentAskingPrice,
            t.isForSale,
            t.isUsed,
            t.resaleCount,
            t.maxResaleCount,
            events[t.eventId].metadataURI
        );
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        TicketDetails storage t = ticketSpecs[tokenId];
        return events[t.eventId].metadataURI;
    }

    function nextEventId() public view returns (uint256) {
        return _nextEventId;
    }

    function nextTokenId() public view returns (uint256) {
        return _nextTokenId;
    }
}
